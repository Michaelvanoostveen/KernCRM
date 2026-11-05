-- Fase 3, stap 2: factuur als verzonden markeren en betalingsherinneringen bijhouden.
-- KernCRM verstuurt de mail nog niet zelf (dat komt met de Microsoft 365-koppeling); medewerkers sturen de factuur zelf en leggen dat hier vast.

alter table public.facturen add column verzonden_op timestamptz;

create table public.factuur_herinneringen (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants (id) on delete restrict,
  factuur_id  uuid not null references public.facturen (id) on delete restrict,
  niveau      integer not null check (niveau between 1 and 3),
  verstuurd_op timestamptz not null default now(),
  door        uuid default auth.uid() references auth.users (id) on delete set null,
  unique (factuur_id, niveau)
);
create index factuur_herinneringen_factuur_idx on public.factuur_herinneringen (factuur_id);
create index factuur_herinneringen_tenant_idx on public.factuur_herinneringen (tenant_id);
alter table public.factuur_herinneringen enable row level security;
create policy factuur_herinneringen_lezen on public.factuur_herinneringen for select to authenticated
  using (public.heeft_rol(tenant_id, array['directie','kantoor','verkoop']::public.gebruikersrol[]));
revoke insert, update, delete, truncate on public.factuur_herinneringen from authenticated, anon;

-- Herinneringen zijn net als betalingen en het logboek niet te wijzigen of verwijderen (behalve dat "door" leeg wordt als die gebruiker verdwijnt).
create or replace function public.factuur_stukken_vergrendelen() returns trigger
  language plpgsql set search_path = ''
  as $$
begin
  if tg_op = 'UPDATE' and tg_table_name in ('factuur_betalingen', 'factuur_wijzigingen', 'factuur_herinneringen')
     and old.door is not null and new.door is null and (to_jsonb(new) - 'door') = (to_jsonb(old) - 'door') then
    return new;
  end if;
  raise exception 'Facturen, betalingen en het logboek kunnen niet worden gewijzigd of verwijderd' using errcode = '55000';
end $$;
create trigger factuur_herinneringen_vergrendelen before update or delete on public.factuur_herinneringen
  for each row execute function public.factuur_stukken_vergrendelen();
create trigger factuur_herinneringen_niet_legen before truncate on public.factuur_herinneringen
  for each statement execute function public.factuur_stukken_vergrendelen();

-- Het moment van verzenden is eenmalig: eenmaal gezet, blijft het staan.
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
    if new.status = 'geannuleerd' and exists (select 1 from public.factuur_betalingen b where b.factuur_id = new.id) then
      raise exception 'Een factuur met betalingen kan niet worden geannuleerd' using errcode = '55000';
    end if;
  end if;
  if new.annulering_reden is distinct from old.annulering_reden and not (old.status = 'open' and new.status = 'geannuleerd') then
    raise exception 'De reden van annuleren staat vast' using errcode = '55000';
  end if;
  return new;
end $$;

-- Legt vast dat de factuur naar de klant is gestuurd.
create function public.markeer_factuur_verzonden(p_factuur uuid) returns jsonb
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
  if f.verzonden_op is not null then return jsonb_build_object('ok', false, 'fout', 'al_verzonden'); end if;
  update public.facturen set verzonden_op = now() where id = f.id;
  insert into public.factuur_wijzigingen (tenant_id, factuur_id, oud, nieuw, reden)
    values (f.tenant_id, f.id, jsonb_build_object('verzonden', false), jsonb_build_object('verzonden', true), '');
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.markeer_factuur_verzonden(uuid) from public, anon;
grant execute on function public.markeer_factuur_verzonden(uuid) to authenticated;

-- Legt vast dat er een betalingsherinnering is gestuurd. Alleen voor een verzonden, verlopen en nog open factuur; de herinneringen volgen elkaar
-- op (1, 2, 3) met minstens 7 dagen ertussen.
create function public.registreer_herinnering(p_factuur uuid) returns jsonb
  language plpgsql security definer set search_path = ''
  as $$
declare
  f public.facturen;
  v_laatste record;
  v_niveau integer;
begin
  select * into f from public.facturen where id = p_factuur for update;
  if not found or not public.heeft_rol(f.tenant_id, array['directie','kantoor']::public.gebruikersrol[]) then
    return jsonb_build_object('ok', false, 'fout', 'geen_toegang');
  end if;
  if f.status <> 'open' then return jsonb_build_object('ok', false, 'fout', 'niet_open'); end if;
  if f.verzonden_op is null then return jsonb_build_object('ok', false, 'fout', 'niet_verzonden'); end if;
  if f.vervaldatum >= (now() at time zone 'Europe/Amsterdam')::date then return jsonb_build_object('ok', false, 'fout', 'nog_niet_verlopen'); end if;
  select niveau, verstuurd_op into v_laatste from public.factuur_herinneringen where factuur_id = f.id order by niveau desc limit 1;
  v_niveau := coalesce(v_laatste.niveau, 0) + 1;
  if v_niveau > 3 then return jsonb_build_object('ok', false, 'fout', 'geen_volgende'); end if;
  if v_laatste.verstuurd_op is not null and v_laatste.verstuurd_op > now() - interval '7 days' then
    return jsonb_build_object('ok', false, 'fout', 'te_snel');
  end if;
  insert into public.factuur_herinneringen (tenant_id, factuur_id, niveau) values (f.tenant_id, f.id, v_niveau);
  return jsonb_build_object('ok', true, 'niveau', v_niveau);
exception when unique_violation then
  return jsonb_build_object('ok', false, 'fout', 'te_snel');
end $$;
revoke all on function public.registreer_herinnering(uuid) from public, anon;
grant execute on function public.registreer_herinnering(uuid) to authenticated;

-- Aanpassen van een open factuur: als in migratie 18, met extra regels voor de vervaldatum na verzenden of herinneren.
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
    if not public.mag_prijzen_aanpassen(f.tenant_id) then return jsonb_build_object('ok', false, 'fout', 'geen_toestemming'); end if;
    if length(btrim(coalesce(p_reden, ''))) = 0 then return jsonb_build_object('ok', false, 'fout', 'reden'); end if;
    if p_excl < 0 or p_hoog < 0 or p_laag < 0 or p_incl <= 0 or p_incl > 10000000
       or round(p_excl + p_hoog + p_laag, 2) <> round(p_incl, 2)
       or p_hoog + p_laag > 0.21 * p_excl + 0.05 or p_hoog + p_laag < 0.09 * p_excl - 0.05 then
      return jsonb_build_object('ok', false, 'fout', 'ongeldig');
    end if;
    if round(p_incl, 2) < v_betaald then return jsonb_build_object('ok', false, 'fout', 'onder_betaald'); end if;
    if (select coalesce(sum(x.totaal_incl), 0) from public.facturen x where x.offerte_id = f.offerte_id and x.status <> 'geannuleerd' and x.id <> f.id) + round(p_incl, 2)
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
