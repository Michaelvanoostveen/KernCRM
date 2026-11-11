-- Fase 3: creditnota's. Een verzonden, nog openstaande factuur corrigeer je met een creditnota (geheel of gedeeltelijk) in plaats van hem te wijzigen.
-- Een creditnota heeft een eigen nummer (CN-jaar-volgnummer), staat vast en verdwijnt nooit. De factuur onthoudt hoeveel er gecrediteerd is:
-- wat nog te betalen is, is het factuurbedrag min het gecrediteerde bedrag. Is alles gecrediteerd, dan krijgt de factuur de status "gecrediteerd"
-- en kan de termijn opnieuw worden gefactureerd. Alleen met de toestemming "prijzen aanpassen" (de directie altijd); de reden staat in het
-- logboek van de directie en niet op de creditnota.

alter table public.facturen add column gecrediteerd numeric(10, 2) not null default 0 check (gecrediteerd >= 0);
alter table public.facturen add constraint facturen_gecrediteerd_max check (gecrediteerd <= totaal_incl);
alter table public.facturen drop constraint facturen_status_check;
alter table public.facturen add constraint facturen_status_check check (status in ('open', 'betaald', 'geannuleerd', 'gecrediteerd'));
drop index public.facturen_een_per_termijn;
create unique index facturen_een_per_termijn on public.facturen (project_id, termijn) where status not in ('geannuleerd', 'gecrediteerd');

create table public.creditnotas (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants (id) on delete restrict,
  factuur_id    uuid not null references public.facturen (id) on delete restrict,
  project_id    uuid not null references public.projecten (id) on delete restrict,
  nummer        text not null,
  datum         date not null,
  omschrijving  text not null check (length(btrim(omschrijving)) > 0 and length(omschrijving) <= 300),
  bedrag_excl   numeric(10, 2) not null check (bedrag_excl >= 0),
  btw_hoog      numeric(10, 2) not null check (btw_hoog >= 0),
  btw_laag      numeric(10, 2) not null check (btw_laag >= 0),
  totaal_incl   numeric(10, 2) not null check (totaal_incl > 0),
  debiteur      jsonb not null,
  verzonden_op  timestamptz,
  door          uuid default auth.uid() references auth.users (id) on delete set null,
  aangemaakt    timestamptz not null default now(),
  unique (tenant_id, nummer),
  check (bedrag_excl + btw_hoog + btw_laag = totaal_incl)
);
create index creditnotas_tenant_idx on public.creditnotas (tenant_id, datum desc);
create index creditnotas_factuur_idx on public.creditnotas (factuur_id);
create index creditnotas_project_idx on public.creditnotas (project_id);

alter table public.creditnotas enable row level security;
create policy creditnotas_lezen on public.creditnotas for select to authenticated
  using (public.heeft_rol(tenant_id, array['directie','kantoor','verkoop']::public.gebruikersrol[]));
revoke insert, update, delete, truncate on public.creditnotas from authenticated, anon;

-- Een creditnota staat vast. Alleen het moment van verzenden is eenmalig te zetten, en "door" wordt leeg als die gebruiker verdwijnt.
create function public.creditnota_vergrendelen() returns trigger
  language plpgsql set search_path = ''
  as $$
begin
  if tg_op = 'UPDATE' and old.door is not null and new.door is null and (to_jsonb(new) - 'door') = (to_jsonb(old) - 'door') then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.verzonden_op is null and new.verzonden_op is not null
     and new.verzonden_op between now() - interval '1 minute' and now() + interval '1 minute'
     and (to_jsonb(new) - 'verzonden_op') = (to_jsonb(old) - 'verzonden_op') then
    return new;
  end if;
  raise exception 'Een creditnota kan niet worden gewijzigd of verwijderd' using errcode = '55000';
end $$;
create trigger creditnotas_vergrendelen before update or delete on public.creditnotas
  for each row execute function public.creditnota_vergrendelen();
create trigger creditnotas_niet_legen before truncate on public.creditnotas
  for each statement execute function public.creditnota_vergrendelen();

-- De factuurfuncties houden rekening met wat er gecrediteerd is.
create or replace function public.facturen_bewaken() returns trigger
  language plpgsql set search_path = ''
  as $$
declare
  v_bewerken boolean := coalesce(current_setting('kerncrm.factuur_bewerken', true), '') = 'on';
begin
  if (new.id, new.tenant_id, new.project_id, new.offerte_id, new.nummer, new.termijn, new.termijn_pct, new.factuurdatum, new.debiteur, new.aangemaakt)
     is distinct from
     (old.id, old.tenant_id, old.project_id, old.offerte_id, old.nummer, old.termijn, old.termijn_pct, old.factuurdatum, old.debiteur, old.aangemaakt)
     or (new.aangemaakt_door is distinct from old.aangemaakt_door and new.aangemaakt_door is not null) then
    raise exception 'Nummer, termijn, factuurdatum en klantgegevens van een factuur liggen vast' using errcode = '55000';
  end if;
  if old.verzonden_op is not null and new.verzonden_op is distinct from old.verzonden_op then
    raise exception 'Het moment van verzenden staat vast' using errcode = '55000';
  end if;
  if old.verzonden_op is null and new.verzonden_op is not null and (old.status <> 'open' or new.verzonden_op < now() - interval '1 minute' or new.verzonden_op > now() + interval '1 minute') then
    raise exception 'Alleen een open factuur kan nu als verzonden worden gemarkeerd' using errcode = '55000';
  end if;
  if (new.omschrijving, new.toelichting, new.vervaldatum, new.bedrag_excl, new.btw_hoog, new.btw_laag, new.totaal_incl, new.meerwerk)
     is distinct from
     (old.omschrijving, old.toelichting, old.vervaldatum, old.bedrag_excl, old.btw_hoog, old.btw_laag, old.totaal_incl, old.meerwerk) then
    if not v_bewerken or old.status <> 'open' then
      raise exception 'Een factuur kan alleen via de wijzigfunctie worden aangepast, en alleen zolang hij open staat' using errcode = '55000';
    end if;
  end if;
  if new.gecrediteerd is distinct from old.gecrediteerd and (not v_bewerken or old.status <> 'open' or new.gecrediteerd < old.gecrediteerd or new.gecrediteerd > new.totaal_incl) then
    raise exception 'Een creditnota kan alleen via de creditnotafunctie worden gemaakt' using errcode = '55000';
  end if;
  if new.status is distinct from old.status then
    if old.status <> 'open' or new.status not in ('betaald', 'geannuleerd', 'gecrediteerd') then
      raise exception 'Deze statusovergang is niet toegestaan' using errcode = '55000';
    end if;
    if new.status = 'betaald' and ((select coalesce(sum(b.bedrag), 0) from public.factuur_betalingen b where b.factuur_id = new.id) + new.gecrediteerd <> new.totaal_incl
       or not exists (select 1 from public.factuur_betalingen b where b.factuur_id = new.id)) then
      raise exception 'Een factuur is pas betaald als het hele bedrag is ontvangen' using errcode = '55000';
    end if;
    if new.status = 'geannuleerd' and length(btrim(coalesce(new.annulering_reden, ''))) = 0 then
      raise exception 'Vul een reden in om een factuur te annuleren' using errcode = '55000';
    end if;
    if new.status = 'gecrediteerd' and (new.gecrediteerd <> new.totaal_incl or exists (select 1 from public.factuur_betalingen b where b.factuur_id = new.id)) then
      raise exception 'Een factuur is pas gecrediteerd als het hele bedrag is gecrediteerd' using errcode = '55000';
    end if;
    if new.status = 'geannuleerd' and (new.gecrediteerd > 0 or exists (select 1 from public.factuur_betalingen b where b.factuur_id = new.id)) then
      raise exception 'Een factuur met betalingen kan niet worden geannuleerd' using errcode = '55000';
    end if;
  end if;
  if new.annulering_reden is distinct from old.annulering_reden and not (old.status = 'open' and new.status = 'geannuleerd') then
    raise exception 'De reden van annuleren staat vast' using errcode = '55000';
  end if;
  return new;
end $$;

create or replace function public.registreer_betaling(p_factuur uuid, p_bedrag numeric, p_datum date, p_notitie text) returns jsonb
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
  if v_betaald + v_bedrag > f.totaal_incl - f.gecrediteerd then return jsonb_build_object('ok', false, 'fout', 'te_veel'); end if;
  insert into public.factuur_betalingen (tenant_id, factuur_id, bedrag, betaald_op, notitie)
    values (f.tenant_id, f.id, v_bedrag, p_datum, left(nullif(btrim(p_notitie), ''), 500));
  if v_betaald + v_bedrag = f.totaal_incl - f.gecrediteerd then
    update public.facturen set status = 'betaald' where id = f.id;
  end if;
  return jsonb_build_object('ok', true, 'betaald', v_betaald + v_bedrag = f.totaal_incl - f.gecrediteerd);
end $$;

create or replace function public.annuleer_factuur(p_factuur uuid, p_reden text) returns jsonb
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
  if f.gecrediteerd > 0 then return jsonb_build_object('ok', false, 'fout', 'heeft_creditnota'); end if;
  if exists (select 1 from public.facturen x where x.project_id = f.project_id and x.termijn > f.termijn and x.status <> 'geannuleerd') then
    return jsonb_build_object('ok', false, 'fout', 'latere_termijn');
  end if;
  update public.facturen set status = 'geannuleerd', annulering_reden = left(btrim(p_reden), 500) where id = f.id;
  insert into public.factuur_wijzigingen (tenant_id, factuur_id, oud, nieuw, reden)
    values (f.tenant_id, f.id, jsonb_build_object('status', 'open'), jsonb_build_object('status', 'geannuleerd'), left(btrim(p_reden), 1000));
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.wijzig_factuur(
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
  -- Vaste volgorde van vergrendelen (eerst de offerte, dan de factuur), zodat gelijktijdige wijzigingen het plafond niet kunnen omzeilen.
  perform 1 from public.offertes where id = (select x.offerte_id from public.facturen x where x.id = p_factuur) for update;
  select * into f from public.facturen where id = p_factuur for update;
  if not found or not public.heeft_rol(f.tenant_id, array['directie','kantoor']::public.gebruikersrol[]) then
    return jsonb_build_object('ok', false, 'fout', 'geen_toegang');
  end if;
  if f.status <> 'open' then return jsonb_build_object('ok', false, 'fout', 'niet_open'); end if;
  if length(btrim(coalesce(p_omschrijving, ''))) = 0 or p_vervaldatum is null
     or p_vervaldatum < f.factuurdatum or p_vervaldatum > f.factuurdatum + 365 then
    return jsonb_build_object('ok', false, 'fout', 'ongeldig');
  end if;
  -- De vervaldatum is niet te gebruiken om herinneringen te omzeilen of uit te lokken: na een herinnering staat hij vast, en na het verzenden kan hij alleen worden verlengd.
  if p_vervaldatum is distinct from f.vervaldatum then
    if exists (select 1 from public.factuur_herinneringen h where h.factuur_id = f.id) then
      return jsonb_build_object('ok', false, 'fout', 'herinnering_bestaat');
    end if;
    if f.verzonden_op is not null and p_vervaldatum < f.vervaldatum then
      return jsonb_build_object('ok', false, 'fout', 'vervaldatum_eerder');
    end if;
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
    if f.gecrediteerd > 0 then return jsonb_build_object('ok', false, 'fout', 'heeft_creditnota'); end if;
    if not public.mag_prijzen_aanpassen(f.tenant_id) then return jsonb_build_object('ok', false, 'fout', 'geen_toestemming'); end if;
    if length(btrim(coalesce(p_reden, ''))) = 0 then return jsonb_build_object('ok', false, 'fout', 'reden'); end if;
    if p_excl < 0 or p_hoog < 0 or p_laag < 0 or p_incl <= 0 or p_incl > 10000000
       or round(p_excl + p_hoog + p_laag, 2) <> round(p_incl, 2)
       or p_hoog + p_laag > 0.21 * p_excl + 0.05 or p_hoog + p_laag < 0.09 * p_excl - 0.05 then
      return jsonb_build_object('ok', false, 'fout', 'ongeldig');
    end if;
    if round(p_incl, 2) < v_betaald then return jsonb_build_object('ok', false, 'fout', 'onder_betaald'); end if;
    if (select coalesce(sum(x.totaal_incl - x.gecrediteerd), 0) from public.facturen x where x.offerte_id = f.offerte_id and x.status <> 'geannuleerd' and x.id <> f.id) + round(p_incl, 2)
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

create or replace function public.maak_factuur(
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
  v_pct numeric;
begin
  select * into p from public.projecten where id = p_project;
  if not found or not public.heeft_rol(p.tenant_id, array['directie','kantoor']::public.gebruikersrol[]) then
    return jsonb_build_object('ok', false, 'fout', 'geen_toegang');
  end if;
  select * into o from public.offertes where project_id = p.id order by versie desc limit 1 for update;
  if not found or o.status <> 'akkoord' then return jsonb_build_object('ok', false, 'fout', 'geen_akkoord'); end if;
  if p_termijn is null or p_termijn < 1 or p_termijn > 10 then return jsonb_build_object('ok', false, 'fout', 'ongeldig'); end if;
  if p_termijn > 1 and not exists (select 1 from public.facturen f where f.project_id = p.id and f.termijn = p_termijn - 1 and f.status not in ('geannuleerd', 'gecrediteerd')) then
    return jsonb_build_object('ok', false, 'fout', 'volgorde');
  end if;
  if exists (select 1 from public.facturen f where f.project_id = p.id and f.termijn = p_termijn and f.status not in ('geannuleerd', 'gecrediteerd')) then
    return jsonb_build_object('ok', false, 'fout', 'bestaat_al');
  end if;
  if p_excl is null or p_hoog is null or p_laag is null or p_incl is null or p_pct is null or p_dagen is null
     or p_excl < 0 or p_hoog < 0 or p_laag < 0 or p_incl <= 0 or p_incl > 10000000
     or round(p_excl + p_hoog + p_laag, 2) <> round(p_incl, 2)
     or p_hoog + p_laag > 0.21 * p_excl + 0.05 or p_hoog + p_laag < 0.09 * p_excl - 0.05
     or p_dagen < 0 or p_dagen > 90 or p_pct < 0 or p_pct > 100
     or length(btrim(coalesce(p_omschrijving, ''))) = 0 then
    return jsonb_build_object('ok', false, 'fout', 'ongeldig');
  end if;
  -- Meer- en minderwerk op een factuur is precies het goedgekeurde bedrag of niets.
  v_meerwerk := public.goedgekeurd_meerwerk(o.id);
  if p_meerwerk is null or (round(p_meerwerk, 2) <> 0 and round(p_meerwerk, 2) <> round(v_meerwerk, 2)) then
    return jsonb_build_object('ok', false, 'fout', 'ongeldig');
  end if;
  if (select coalesce(sum(f.totaal_incl - f.gecrediteerd), 0) from public.facturen f where f.offerte_id = o.id and f.status not in ('geannuleerd', 'gecrediteerd')) + round(p_incl, 2)
     > public.factuur_plafond(o.id) + 0.05 then
    return jsonb_build_object('ok', false, 'fout', 'boven_opdracht');
  end if;
  -- De termijnpercentages van de lopende facturen mogen samen niet boven 100% komen; meer- en minderwerk staat alleen op de laatste termijn.
  v_pct := (select coalesce(sum(f.termijn_pct), 0) from public.facturen f where f.offerte_id = o.id and f.status not in ('geannuleerd', 'gecrediteerd')) + p_pct;
  if v_pct > 100.01 or (round(p_meerwerk, 2) <> 0 and v_pct < 99.99) then
    return jsonb_build_object('ok', false, 'fout', 'ongeldig');
  end if;
  -- Wijkt het bedrag af van het termijnpercentage van het getekende bedrag (plus het meerwerk), dan heb je de toestemming "prijzen aanpassen" nodig.
  if abs(round(p_incl, 2) - round(p_pct / 100 * coalesce((select a.totaal from public.offerte_akkoorden a where a.offerte_id = o.id), 0), 2) - round(p_meerwerk, 2)) > 1
     and not public.mag_prijzen_aanpassen(p.tenant_id) then
    return jsonb_build_object('ok', false, 'fout', 'geen_toestemming');
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

-- Maakt een (gedeeltelijke) creditnota op een verzonden, openstaande factuur. De bedragen komen van de app; de database bewaakt de btw-opbouw
-- en dat er niet meer wordt gecrediteerd dan er nog openstaat. De reden komt in het logboek van de directie.
create function public.maak_creditnota(
  p_factuur uuid, p_omschrijving text, p_excl numeric, p_hoog numeric, p_laag numeric, p_incl numeric, p_reden text
) returns jsonb
  language plpgsql security definer set search_path = ''
  as $$
declare
  f public.facturen;
  v_betaald numeric(10, 2);
  v_nieuw numeric(10, 2);
  v_nummer text;
  v_jaar integer := extract(year from now() at time zone 'Europe/Amsterdam')::integer;
  v_n integer;
  v_id uuid;
  v_status text;
begin
  perform 1 from public.offertes where id = (select x.offerte_id from public.facturen x where x.id = p_factuur) for update;
  select * into f from public.facturen where id = p_factuur for update;
  if not found or not public.heeft_rol(f.tenant_id, array['directie','kantoor']::public.gebruikersrol[]) then
    return jsonb_build_object('ok', false, 'fout', 'geen_toegang');
  end if;
  if not public.mag_prijzen_aanpassen(f.tenant_id) then return jsonb_build_object('ok', false, 'fout', 'geen_toestemming'); end if;
  if f.status <> 'open' then return jsonb_build_object('ok', false, 'fout', 'niet_open'); end if;
  if f.verzonden_op is null then return jsonb_build_object('ok', false, 'fout', 'niet_verzonden'); end if;
  if length(btrim(coalesce(p_reden, ''))) = 0 then return jsonb_build_object('ok', false, 'fout', 'reden'); end if;
  if length(btrim(coalesce(p_omschrijving, ''))) = 0
     or p_excl is null or p_hoog is null or p_laag is null or p_incl is null
     or p_excl < 0 or p_hoog < 0 or p_laag < 0 or p_incl <= 0 or p_incl > 10000000
     or round(p_excl + p_hoog + p_laag, 2) <> round(p_incl, 2)
     or p_hoog + p_laag > 0.21 * p_excl + 0.05 or p_hoog + p_laag < 0.09 * p_excl - 0.05 then
    return jsonb_build_object('ok', false, 'fout', 'ongeldig');
  end if;
  select coalesce(sum(bedrag), 0) into v_betaald from public.factuur_betalingen where factuur_id = f.id;
  if round(p_incl, 2) > f.totaal_incl - f.gecrediteerd - v_betaald then
    return jsonb_build_object('ok', false, 'fout', 'te_veel');
  end if;

  insert into public.nummerreeksen (tenant_id, soort, jaar, laatste) values (f.tenant_id, 'creditnota', v_jaar, 1)
    on conflict (tenant_id, soort, jaar) do update set laatste = public.nummerreeksen.laatste + 1
    returning laatste into v_n;
  v_nummer := 'CN-' || v_jaar::text || '-' || lpad(v_n::text, 4, '0');
  insert into public.creditnotas (tenant_id, factuur_id, project_id, nummer, datum, omschrijving, bedrag_excl, btw_hoog, btw_laag, totaal_incl, debiteur)
    values (f.tenant_id, f.id, f.project_id, v_nummer, (now() at time zone 'Europe/Amsterdam')::date, left(btrim(p_omschrijving), 300),
            round(p_excl, 2), round(p_hoog, 2), round(p_laag, 2), round(p_incl, 2), f.debiteur)
    returning id into v_id;

  v_nieuw := f.gecrediteerd + round(p_incl, 2);
  v_status := case when v_nieuw = f.totaal_incl and v_betaald = 0 then 'gecrediteerd'
                   when v_nieuw + v_betaald = f.totaal_incl and v_betaald > 0 then 'betaald'
                   else 'open' end;
  perform set_config('kerncrm.factuur_bewerken', 'on', true);
  update public.facturen set gecrediteerd = v_nieuw, status = v_status where id = f.id;
  perform set_config('kerncrm.factuur_bewerken', 'off', true);
  insert into public.factuur_wijzigingen (tenant_id, factuur_id, oud, nieuw, reden)
    values (f.tenant_id, f.id, jsonb_build_object('gecrediteerd', f.gecrediteerd), jsonb_build_object('gecrediteerd', v_nieuw, 'creditnota', v_nummer), left(btrim(p_reden), 1000));
  return jsonb_build_object('ok', true, 'id', v_id, 'nummer', v_nummer, 'status', v_status);
end $$;
revoke all on function public.maak_creditnota(uuid, text, numeric, numeric, numeric, numeric, text) from public, anon;
grant execute on function public.maak_creditnota(uuid, text, numeric, numeric, numeric, numeric, text) to authenticated;

-- Legt vast dat de creditnota naar de klant is gestuurd (eenmalig).
create function public.markeer_creditnota_verzonden(p_creditnota uuid) returns jsonb
  language plpgsql security definer set search_path = ''
  as $$
declare
  c public.creditnotas;
begin
  select * into c from public.creditnotas where id = p_creditnota for update;
  if not found or not public.heeft_rol(c.tenant_id, array['directie','kantoor']::public.gebruikersrol[]) then
    return jsonb_build_object('ok', false, 'fout', 'geen_toegang');
  end if;
  if c.verzonden_op is not null then return jsonb_build_object('ok', false, 'fout', 'al_verzonden'); end if;
  update public.creditnotas set verzonden_op = now() where id = c.id;
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.markeer_creditnota_verzonden(uuid) from public, anon;
grant execute on function public.markeer_creditnota_verzonden(uuid) to authenticated;
