-- Fase 3, stap 1: termijnfacturen, betalingen en wijzigingen daarop.
-- Een factuur is een boekhoudkundig stuk: het nummer, de termijn, de factuurdatum en de klantgegevens (zoals ze waren) liggen vast en
-- een factuur verdwijnt niet met het project. Tekst, vervaldatum en bedragen zijn aan te passen zolang de factuur open staat:
-- tekst en vervaldatum door directie en kantoor, bedragen alleen met de toestemming "prijzen aanpassen" en met een reden.
-- Elke wijziging komt, met de oude en nieuwe waarden, in een logboek dat alleen de directie leest. Bij een fout kun je ook annuleren
-- (het nummer blijft bestaan) en opnieuw factureren.

-- Het factuurnummer mag je alleen via de factuurfuncties nemen: anders ontstaan er gaten in de reeks.
create or replace function public.volgend_nummer(p_tenant uuid, p_soort text) returns text
  language plpgsql security definer set search_path = ''
  as $$
declare
  v_jaar integer := extract(year from now() at time zone 'Europe/Amsterdam')::integer;
  v_n integer;
begin
  if p_tenant not in (select public.mijn_tenants()) then
    raise exception 'Geen toegang tot dit bedrijf' using errcode = '42501';
  end if;
  if p_soort = 'factuur' and not public.heeft_rol(p_tenant, array['directie','kantoor']::public.gebruikersrol[]) then
    raise exception 'Geen toegang tot de factuurnummers' using errcode = '42501';
  end if;
  insert into public.nummerreeksen (tenant_id, soort, jaar, laatste) values (p_tenant, p_soort, v_jaar, 1)
  on conflict (tenant_id, soort, jaar) do update set laatste = public.nummerreeksen.laatste + 1
  returning laatste into v_n;
  return v_jaar::text || '-' || lpad(v_n::text, 4, '0');
end $$;

create table public.facturen (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants (id) on delete restrict,
  project_id    uuid not null references public.projecten (id) on delete restrict,
  offerte_id    uuid not null references public.offertes (id) on delete restrict,
  nummer        text not null,
  termijn       integer not null check (termijn between 1 and 10),
  termijn_pct   numeric(5, 2) not null check (termijn_pct >= 0 and termijn_pct <= 100),
  omschrijving  text not null check (length(btrim(omschrijving)) > 0),
  toelichting   text,
  factuurdatum  date not null,
  vervaldatum   date not null,
  bedrag_excl   numeric(10, 2) not null check (bedrag_excl >= 0),
  btw_hoog      numeric(10, 2) not null check (btw_hoog >= 0),
  btw_laag      numeric(10, 2) not null check (btw_laag >= 0),
  totaal_incl   numeric(10, 2) not null check (totaal_incl > 0),
  meerwerk      numeric(10, 2) not null default 0,       -- het deel van het totaal dat meer- of minderwerk is (alleen eindfactuur)
  debiteur      jsonb not null,                          -- naam en adres van de klant zoals ze waren bij het aanmaken
  status        text not null default 'open' check (status in ('open', 'betaald', 'geannuleerd')),
  annulering_reden text,
  aangemaakt_door uuid default auth.uid() references auth.users (id) on delete set null,
  aangemaakt    timestamptz not null default now(),
  unique (tenant_id, nummer),
  check (bedrag_excl + btw_hoog + btw_laag = totaal_incl),
  check (vervaldatum >= factuurdatum)
);
create index facturen_tenant_idx on public.facturen (tenant_id, factuurdatum desc);
create index facturen_project_idx on public.facturen (project_id);
create index facturen_offerte_idx on public.facturen (offerte_id);
-- Per project maar één lopende factuur per termijn.
create unique index facturen_een_per_termijn on public.facturen (project_id, termijn) where status <> 'geannuleerd';

create table public.factuur_betalingen (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants (id) on delete restrict,
  factuur_id  uuid not null references public.facturen (id) on delete restrict,
  bedrag      numeric(10, 2) not null check (bedrag > 0),
  betaald_op  date not null,
  notitie     text,
  door        uuid default auth.uid() references auth.users (id) on delete set null,
  aangemaakt  timestamptz not null default now()
);
create index factuur_betalingen_factuur_idx on public.factuur_betalingen (factuur_id);
create index factuur_betalingen_tenant_idx on public.factuur_betalingen (tenant_id);

-- Wat er aan een factuur is gewijzigd, door wie en waarom. Alleen de directie leest dit.
create table public.factuur_wijzigingen (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants (id) on delete restrict,
  factuur_id  uuid not null references public.facturen (id) on delete restrict,
  oud         jsonb not null,
  nieuw       jsonb not null,
  reden       text not null default '',
  door        uuid default auth.uid() references auth.users (id) on delete set null,
  op          timestamptz not null default now()
);
create index factuur_wijzigingen_factuur_idx on public.factuur_wijzigingen (factuur_id);
create index factuur_wijzigingen_tenant_idx on public.factuur_wijzigingen (tenant_id);

alter table public.facturen enable row level security;
alter table public.factuur_betalingen enable row level security;
alter table public.factuur_wijzigingen enable row level security;

-- Lezen: directie, kantoor en verkoop (het logboek alleen de directie). Schrijven uitsluitend via de functies hieronder.
create policy facturen_lezen on public.facturen for select to authenticated
  using (public.heeft_rol(tenant_id, array['directie','kantoor','verkoop']::public.gebruikersrol[]));
create policy factuur_betalingen_lezen on public.factuur_betalingen for select to authenticated
  using (public.heeft_rol(tenant_id, array['directie','kantoor','verkoop']::public.gebruikersrol[]));
create policy factuur_wijzigingen_lezen on public.factuur_wijzigingen for select to authenticated
  using (public.heeft_rol(tenant_id, array['directie']::public.gebruikersrol[]));
revoke insert, update, delete, truncate on public.facturen, public.factuur_betalingen, public.factuur_wijzigingen from authenticated, anon;

-- Bewaakt wat er aan een factuur mag veranderen, ook voor wie de tabel rechtstreeks benadert.
create function public.facturen_bewaken() returns trigger
  language plpgsql set search_path = ''
  as $$
declare
  v_bewerken boolean := coalesce(current_setting('kerncrm.factuur_bewerken', true), '') = 'on';
begin
  if (new.tenant_id, new.project_id, new.offerte_id, new.nummer, new.termijn, new.termijn_pct, new.factuurdatum, new.debiteur, new.aangemaakt_door, new.aangemaakt)
     is distinct from
     (old.tenant_id, old.project_id, old.offerte_id, old.nummer, old.termijn, old.termijn_pct, old.factuurdatum, old.debiteur, old.aangemaakt_door, old.aangemaakt) then
    raise exception 'Nummer, termijn, factuurdatum en klantgegevens van een factuur liggen vast' using errcode = '55000';
  end if;
  if (new.omschrijving, new.toelichting, new.vervaldatum, new.bedrag_excl, new.btw_hoog, new.btw_laag, new.totaal_incl, new.meerwerk)
     is distinct from
     (old.omschrijving, old.toelichting, old.vervaldatum, old.bedrag_excl, old.btw_hoog, old.btw_laag, old.totaal_incl, old.meerwerk) then
    if not v_bewerken or old.status <> 'open' then
      raise exception 'Een factuur kan alleen via de wijzigfunctie worden aangepast, en alleen zolang hij open staat' using errcode = '55000';
    end if;
  end if;
  if new.status is distinct from old.status then
    if old.status <> 'open' or new.status not in ('betaald', 'geannuleerd') then
      raise exception 'Deze statusovergang is niet toegestaan' using errcode = '55000';
    end if;
    if new.status = 'betaald' and (select coalesce(sum(b.bedrag), 0) from public.factuur_betalingen b where b.factuur_id = new.id) <> new.totaal_incl then
      raise exception 'Een factuur is pas betaald als het hele bedrag is ontvangen' using errcode = '55000';
    end if;
    if new.status = 'geannuleerd' and length(btrim(coalesce(new.annulering_reden, ''))) = 0 then
      raise exception 'Vul een reden in om een factuur te annuleren' using errcode = '55000';
    end if;
  end if;
  if new.annulering_reden is distinct from old.annulering_reden and not (old.status = 'open' and new.status = 'geannuleerd') then
    raise exception 'De reden van annuleren staat vast' using errcode = '55000';
  end if;
  return new;
end $$;
create trigger facturen_bewaken before update on public.facturen
  for each row execute function public.facturen_bewaken();

-- Facturen, betalingen en het logboek verdwijnen nooit (fiscale bewaarplicht) en een betaling of logregel is niet te wijzigen.
create function public.factuur_stukken_vergrendelen() returns trigger
  language plpgsql set search_path = ''
  as $$
begin
  raise exception 'Facturen, betalingen en het logboek kunnen niet worden gewijzigd of verwijderd' using errcode = '55000';
end $$;
create trigger factuur_betalingen_vergrendelen before update or delete on public.factuur_betalingen
  for each row execute function public.factuur_stukken_vergrendelen();
create trigger factuur_wijzigingen_vergrendelen before update or delete on public.factuur_wijzigingen
  for each row execute function public.factuur_stukken_vergrendelen();
create trigger facturen_niet_verwijderen before delete on public.facturen
  for each row execute function public.factuur_stukken_vergrendelen();
create trigger facturen_niet_legen before truncate on public.facturen
  for each statement execute function public.factuur_stukken_vergrendelen();
create trigger factuur_betalingen_niet_legen before truncate on public.factuur_betalingen
  for each statement execute function public.factuur_stukken_vergrendelen();
create trigger factuur_wijzigingen_niet_legen before truncate on public.factuur_wijzigingen
  for each statement execute function public.factuur_stukken_vergrendelen();

create function public.goedgekeurd_meerwerk(p_offerte uuid) returns numeric
  language sql stable security definer set search_path = ''
  as $$
  select coalesce(sum(w.meerprijs), 0)
  from public.inmeting_wijzigingen w
  join public.inmetingen i on i.id = w.inmeting_id
  where i.offerte_id = p_offerte and w.status = 'akkoord'
$$;
revoke all on function public.goedgekeurd_meerwerk(uuid) from public, anon, authenticated;

-- Hoeveel mag er in totaal worden gefactureerd? Het getekende offertebedrag plus het door de klant goedgekeurde meer- en minderwerk.
create function public.factuur_plafond(p_offerte uuid) returns numeric
  language sql stable security definer set search_path = ''
  as $$
  select coalesce((select a.totaal from public.offerte_akkoorden a where a.offerte_id = p_offerte), 0)
       + public.goedgekeurd_meerwerk(p_offerte)
$$;
revoke all on function public.factuur_plafond(uuid) from public, anon, authenticated;

-- Maakt een termijnfactuur aan. De bedragen rekent de app uit de getekende offerte en het goedgekeurde meerwerk; de database bewaakt
-- de volgorde, de btw-opbouw en dat het totaal van alle facturen het getekende bedrag plus goedgekeurd meerwerk niet overstijgt.
create function public.maak_factuur(
  p_project uuid, p_termijn integer, p_pct numeric, p_omschrijving text, p_toelichting text, p_dagen integer,
  p_excl numeric, p_hoog numeric, p_laag numeric, p_incl numeric, p_meerwerk numeric
) returns jsonb
  language plpgsql security definer set search_path = ''
  as $$
declare
  p public.projecten;
  o public.offertes;
  v_datum date := (now() at time zone 'Europe/Amsterdam')::date;
  v_nummer text;
  v_id uuid;
  v_debiteur jsonb;
  v_meerwerk numeric := 0;
begin
  select * into p from public.projecten where id = p_project;
  if not found or not public.heeft_rol(p.tenant_id, array['directie','kantoor']::public.gebruikersrol[]) then
    return jsonb_build_object('ok', false, 'fout', 'geen_toegang');
  end if;
  select * into o from public.offertes where project_id = p.id order by versie desc limit 1 for update;
  if not found or o.status <> 'akkoord' then return jsonb_build_object('ok', false, 'fout', 'geen_akkoord'); end if;
  if p_termijn is null or p_termijn < 1 or p_termijn > 10 then return jsonb_build_object('ok', false, 'fout', 'ongeldig'); end if;
  if p_termijn > 1 and not exists (select 1 from public.facturen f where f.project_id = p.id and f.termijn = p_termijn - 1 and f.status <> 'geannuleerd') then
    return jsonb_build_object('ok', false, 'fout', 'volgorde');
  end if;
  if exists (select 1 from public.facturen f where f.project_id = p.id and f.termijn = p_termijn and f.status <> 'geannuleerd') then
    return jsonb_build_object('ok', false, 'fout', 'bestaat_al');
  end if;
  if p_excl is null or p_hoog is null or p_laag is null or p_incl is null or p_pct is null or p_dagen is null
     or p_excl < 0 or p_hoog < 0 or p_laag < 0 or p_incl <= 0 or p_incl > 10000000
     or round(p_excl + p_hoog + p_laag, 2) <> round(p_incl, 2)
     or p_hoog + p_laag > 0.21 * p_excl + 0.05
     or p_dagen < 0 or p_dagen > 90 or p_pct < 0 or p_pct > 100
     or length(btrim(coalesce(p_omschrijving, ''))) = 0 then
    return jsonb_build_object('ok', false, 'fout', 'ongeldig');
  end if;
  -- Meer- en minderwerk op een factuur is precies het goedgekeurde bedrag of niets.
  v_meerwerk := public.goedgekeurd_meerwerk(o.id);
  if p_meerwerk is null or (round(p_meerwerk, 2) <> 0 and round(p_meerwerk, 2) <> round(v_meerwerk, 2)) then
    return jsonb_build_object('ok', false, 'fout', 'ongeldig');
  end if;
  if (select coalesce(sum(f.totaal_incl), 0) from public.facturen f where f.project_id = p.id and f.status <> 'geannuleerd') + round(p_incl, 2)
     > public.factuur_plafond(o.id) + 0.05 then
    return jsonb_build_object('ok', false, 'fout', 'boven_opdracht');
  end if;

  select jsonb_build_object('naam', k.naam, 'aanhef', k.aanhef, 'achternaam', k.achternaam, 'regels', coalesce((
           select jsonb_build_array(a.straat || ' ' || a.huisnummer || coalesce(' ' || a.toevoeging, ''), a.postcode || ' ' || a.plaats)
           from public.adressen a where a.klant_id = k.id and a.tenant_id = p.tenant_id
           order by (a.soort = 'factuur') desc, a.aangemaakt limit 1), '[]'::jsonb))
    into v_debiteur from public.klanten k where k.id = p.klant_id and k.tenant_id = p.tenant_id;
  if v_debiteur is null then return jsonb_build_object('ok', false, 'fout', 'ongeldig'); end if;

  v_nummer := public.volgend_nummer(p.tenant_id, 'factuur');
  insert into public.facturen (tenant_id, project_id, offerte_id, nummer, termijn, termijn_pct, omschrijving, toelichting, factuurdatum, vervaldatum,
                               bedrag_excl, btw_hoog, btw_laag, totaal_incl, meerwerk, debiteur)
    values (p.tenant_id, p.id, o.id, v_nummer, p_termijn, p_pct, left(btrim(p_omschrijving), 300), left(p_toelichting, 2000), v_datum, v_datum + p_dagen,
            round(p_excl, 2), round(p_hoog, 2), round(p_laag, 2), round(p_incl, 2), round(p_meerwerk, 2), v_debiteur)
    returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id, 'nummer', v_nummer);
exception when unique_violation then
  return jsonb_build_object('ok', false, 'fout', 'bestaat_al');
end $$;
revoke all on function public.maak_factuur(uuid, integer, numeric, text, text, integer, numeric, numeric, numeric, numeric, numeric) from public, anon;
grant execute on function public.maak_factuur(uuid, integer, numeric, text, text, integer, numeric, numeric, numeric, numeric, numeric) to authenticated;

-- Past een open factuur aan. Tekst en vervaldatum: directie en kantoor. Bedragen: alleen met de toestemming "prijzen aanpassen", met een reden,
-- niet onder wat al is betaald en niet boven de opdracht. Alles komt in het logboek.
create function public.wijzig_factuur(
  p_factuur uuid, p_omschrijving text, p_toelichting text, p_vervaldatum date,
  p_excl numeric, p_hoog numeric, p_laag numeric, p_incl numeric, p_reden text
) returns jsonb
  language plpgsql security definer set search_path = ''
  as $$
declare
  f public.facturen;
  v_betaald numeric(10, 2);
  v_bedragen boolean;
  v_tekst boolean;
  v_status text;
begin
  select * into f from public.facturen where id = p_factuur for update;
  if not found or not public.heeft_rol(f.tenant_id, array['directie','kantoor']::public.gebruikersrol[]) then
    return jsonb_build_object('ok', false, 'fout', 'geen_toegang');
  end if;
  if f.status <> 'open' then return jsonb_build_object('ok', false, 'fout', 'niet_open'); end if;
  if length(btrim(coalesce(p_omschrijving, ''))) = 0 or p_vervaldatum is null
     or p_vervaldatum < f.factuurdatum or p_vervaldatum > f.factuurdatum + 365 then
    return jsonb_build_object('ok', false, 'fout', 'ongeldig');
  end if;

  v_tekst := (left(btrim(p_omschrijving), 300), left(p_toelichting, 2000), p_vervaldatum)
             is distinct from (f.omschrijving, f.toelichting, f.vervaldatum);
  v_bedragen := p_excl is not null and p_hoog is not null and p_laag is not null and p_incl is not null
                and (round(p_excl, 2), round(p_hoog, 2), round(p_laag, 2), round(p_incl, 2))
                    is distinct from (f.bedrag_excl, f.btw_hoog, f.btw_laag, f.totaal_incl);
  if (p_excl is null or p_hoog is null or p_laag is null or p_incl is null) and not (p_excl is null and p_hoog is null and p_laag is null and p_incl is null) then
    return jsonb_build_object('ok', false, 'fout', 'ongeldig');
  end if;

  select coalesce(sum(bedrag), 0) into v_betaald from public.factuur_betalingen where factuur_id = f.id;
  if v_bedragen then
    if not public.mag_prijzen_aanpassen(f.tenant_id) then return jsonb_build_object('ok', false, 'fout', 'geen_toestemming'); end if;
    if length(btrim(coalesce(p_reden, ''))) = 0 then return jsonb_build_object('ok', false, 'fout', 'reden'); end if;
    if p_excl < 0 or p_hoog < 0 or p_laag < 0 or p_incl <= 0 or p_incl > 10000000
       or round(p_excl + p_hoog + p_laag, 2) <> round(p_incl, 2) or p_hoog + p_laag > 0.21 * p_excl + 0.05 then
      return jsonb_build_object('ok', false, 'fout', 'ongeldig');
    end if;
    if round(p_incl, 2) < v_betaald then return jsonb_build_object('ok', false, 'fout', 'onder_betaald'); end if;
    if (select coalesce(sum(x.totaal_incl), 0) from public.facturen x where x.project_id = f.project_id and x.status <> 'geannuleerd' and x.id <> f.id) + round(p_incl, 2)
       > public.factuur_plafond(f.offerte_id) + 0.05 then
      return jsonb_build_object('ok', false, 'fout', 'boven_opdracht');
    end if;
  end if;
  if not v_tekst and not v_bedragen then return jsonb_build_object('ok', true, 'gewijzigd', false); end if;

  perform set_config('kerncrm.factuur_bewerken', 'on', true);
  insert into public.factuur_wijzigingen (tenant_id, factuur_id, oud, nieuw, reden)
    values (f.tenant_id, f.id,
            jsonb_build_object('omschrijving', f.omschrijving, 'toelichting', f.toelichting, 'vervaldatum', f.vervaldatum, 'bedrag_excl', f.bedrag_excl, 'btw_hoog', f.btw_hoog, 'btw_laag', f.btw_laag, 'totaal_incl', f.totaal_incl),
            jsonb_build_object('omschrijving', left(btrim(p_omschrijving), 300), 'toelichting', left(p_toelichting, 2000), 'vervaldatum', p_vervaldatum,
                               'bedrag_excl', case when v_bedragen then round(p_excl, 2) else f.bedrag_excl end,
                               'btw_hoog', case when v_bedragen then round(p_hoog, 2) else f.btw_hoog end,
                               'btw_laag', case when v_bedragen then round(p_laag, 2) else f.btw_laag end,
                               'totaal_incl', case when v_bedragen then round(p_incl, 2) else f.totaal_incl end),
            left(btrim(coalesce(p_reden, '')), 1000));
  v_status := case when v_bedragen and v_betaald > 0 and round(p_incl, 2) = v_betaald then 'betaald' else 'open' end;
  update public.facturen set
    omschrijving = left(btrim(p_omschrijving), 300), toelichting = left(p_toelichting, 2000), vervaldatum = p_vervaldatum,
    bedrag_excl = case when v_bedragen then round(p_excl, 2) else bedrag_excl end,
    btw_hoog = case when v_bedragen then round(p_hoog, 2) else btw_hoog end,
    btw_laag = case when v_bedragen then round(p_laag, 2) else btw_laag end,
    totaal_incl = case when v_bedragen then round(p_incl, 2) else totaal_incl end,
    status = v_status
    where id = f.id;
  perform set_config('kerncrm.factuur_bewerken', 'off', true);
  return jsonb_build_object('ok', true, 'gewijzigd', true, 'betaald', v_status = 'betaald');
end $$;
revoke all on function public.wijzig_factuur(uuid, text, text, date, numeric, numeric, numeric, numeric, text) from public, anon;
grant execute on function public.wijzig_factuur(uuid, text, text, date, numeric, numeric, numeric, numeric, text) to authenticated;

-- Registreert een betaling. Is het hele bedrag binnen, dan is de factuur betaald.
create function public.registreer_betaling(p_factuur uuid, p_bedrag numeric, p_datum date, p_notitie text) returns jsonb
  language plpgsql security definer set search_path = ''
  as $$
declare
  f public.facturen;
  v_betaald numeric(10, 2);
  v_bedrag numeric(10, 2);
begin
  select * into f from public.facturen where id = p_factuur for update;
  if not found or not public.heeft_rol(f.tenant_id, array['directie','kantoor']::public.gebruikersrol[]) then
    return jsonb_build_object('ok', false, 'fout', 'geen_toegang');
  end if;
  if f.status <> 'open' then return jsonb_build_object('ok', false, 'fout', 'niet_open'); end if;
  v_bedrag := round(p_bedrag, 2);
  if p_bedrag is null or v_bedrag <= 0 or p_datum is null or p_datum < f.factuurdatum or p_datum > (now() at time zone 'Europe/Amsterdam')::date + 1 then
    return jsonb_build_object('ok', false, 'fout', 'ongeldig');
  end if;
  -- Zelfde bedrag op dezelfde dag binnen een minuut: waarschijnlijk een dubbele klik.
  if exists (select 1 from public.factuur_betalingen b where b.factuur_id = f.id and b.bedrag = v_bedrag and b.betaald_op = p_datum and b.aangemaakt > now() - interval '1 minute') then
    return jsonb_build_object('ok', false, 'fout', 'dubbel');
  end if;
  select coalesce(sum(bedrag), 0) into v_betaald from public.factuur_betalingen where factuur_id = f.id;
  if v_betaald + v_bedrag > f.totaal_incl then return jsonb_build_object('ok', false, 'fout', 'te_veel'); end if;
  insert into public.factuur_betalingen (tenant_id, factuur_id, bedrag, betaald_op, notitie)
    values (f.tenant_id, f.id, v_bedrag, p_datum, left(nullif(btrim(p_notitie), ''), 500));
  if v_betaald + v_bedrag = f.totaal_incl then
    update public.facturen set status = 'betaald' where id = f.id;
  end if;
  return jsonb_build_object('ok', true, 'betaald', v_betaald + v_bedrag = f.totaal_incl);
end $$;
revoke all on function public.registreer_betaling(uuid, numeric, date, text) from public, anon;
grant execute on function public.registreer_betaling(uuid, numeric, date, text) to authenticated;

-- Annuleert een factuur zonder betalingen, als er geen latere termijn meer loopt. Het nummer blijft bestaan; daarna kan de termijn opnieuw.
create function public.annuleer_factuur(p_factuur uuid, p_reden text) returns jsonb
  language plpgsql security definer set search_path = ''
  as $$
declare
  f public.facturen;
begin
  select * into f from public.facturen where id = p_factuur for update;
  if not found or not public.heeft_rol(f.tenant_id, array['directie','kantoor']::public.gebruikersrol[]) then
    return jsonb_build_object('ok', false, 'fout', 'geen_toegang');
  end if;
  if f.status <> 'open' then return jsonb_build_object('ok', false, 'fout', 'niet_open'); end if;
  if length(btrim(coalesce(p_reden, ''))) = 0 then return jsonb_build_object('ok', false, 'fout', 'reden'); end if;
  if exists (select 1 from public.factuur_betalingen b where b.factuur_id = f.id) then return jsonb_build_object('ok', false, 'fout', 'heeft_betalingen'); end if;
  if exists (select 1 from public.facturen x where x.project_id = f.project_id and x.termijn > f.termijn and x.status <> 'geannuleerd') then
    return jsonb_build_object('ok', false, 'fout', 'latere_termijn');
  end if;
  update public.facturen set status = 'geannuleerd', annulering_reden = left(btrim(p_reden), 500) where id = f.id;
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.annuleer_factuur(uuid, text) from public, anon;
grant execute on function public.annuleer_factuur(uuid, text) to authenticated;
