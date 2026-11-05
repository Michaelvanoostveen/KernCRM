-- Fase 1, stap 12: nieuwe versie van een verstuurde offerte, en een duidelijke melding voor wie de oude link opent.

create or replace function public.offerte_regels_prijscontrole() returns trigger
  language plpgsql security definer set search_path = ''
  as $$
declare
  v_kopie boolean := coalesce(current_setting('kerncrm.versiekopie', true), '') = 'on';
  v_mag boolean := v_kopie or public.mag_prijzen_aanpassen(new.tenant_id);
  v_basis numeric(10, 2);
  v_oud numeric(10, 2);
  v_reden text := btrim(coalesce(new.override_reden, ''));
begin
  if new.soort = 'artikel' and new.artikel_id is not null then
    -- Bij een nieuwe versie nemen we de prijs over zoals die op de vorige versie stond.
    if not v_kopie then
      select a.verkoopprijs_incl into new.catalogusprijs from public.artikelen a where a.id = new.artikel_id and a.tenant_id = new.tenant_id;
      if new.catalogusprijs is null then
        raise exception 'Dit artikel bestaat niet in de catalogus' using errcode = '23503';
      end if;
      new.prijs := new.catalogusprijs;
    end if;
  elsif new.soort = 'artikel' and not v_mag then
    if tg_op = 'INSERT' or new.prijs is distinct from old.prijs or old.artikel_id is not null then
      raise exception 'Zonder toestemming kun je alleen artikelen uit de catalogus gebruiken' using errcode = '42501';
    end if;
  end if;

  if new.soort = 'positie' then
    select p.prijs into v_basis from public.posities p where p.id = new.positie_id;
  else
    v_basis := new.prijs;
  end if;

  if new.prijs_override is not null and (tg_op = 'INSERT' or new.prijs_override is distinct from old.prijs_override) then
    if not v_mag then
      raise exception 'Je hebt geen toestemming om prijzen handmatig aan te passen' using errcode = '42501';
    end if;
    if v_reden = '' then
      raise exception 'Vul bij een handmatige prijs een reden in' using errcode = '23514';
    end if;
    v_oud := case when tg_op = 'UPDATE' then coalesce(old.prijs_override, v_basis) else v_basis end;
    insert into public.prijsaanpassingen (tenant_id, offerte_id, regel_id, soort, oud, nieuw, reden)
      values (new.tenant_id, new.offerte_id, new.id, 'regel', v_oud, new.prijs_override, v_reden);
    new.override_door := auth.uid(); new.override_op := now();
  elsif new.prijs_override is null and tg_op = 'UPDATE' and old.prijs_override is not null then
    insert into public.prijsaanpassingen (tenant_id, offerte_id, regel_id, soort, oud, nieuw, reden)
      values (new.tenant_id, new.offerte_id, new.id, 'regel', old.prijs_override, null, 'Aanpassing teruggezet');
    new.override_door := null; new.override_op := null;
  end if;

  -- De reden staat uitsluitend in het logboek, nooit op de regel zelf.
  new.override_reden := null;
  return new;
end $$;


create or replace function public.offertes_prijscontrole() returns trigger
  language plpgsql security definer set search_path = ''
  as $$
declare
  v_reden text := btrim(coalesce(new.totaal_override_reden, ''));
  v_kopie boolean := coalesce(current_setting('kerncrm.versiekopie', true), '') = 'on';
begin
  if new.totaal_override is not null and (tg_op = 'INSERT' or new.totaal_override is distinct from old.totaal_override) then
    if not (v_kopie or public.mag_prijzen_aanpassen(new.tenant_id)) then
      raise exception 'Je hebt geen toestemming om prijzen handmatig aan te passen' using errcode = '42501';
    end if;
    if v_reden = '' then
      raise exception 'Vul bij een eigen totaalprijs een reden in' using errcode = '23514';
    end if;
    insert into public.prijsaanpassingen (tenant_id, offerte_id, regel_id, soort, oud, nieuw, reden)
      values (new.tenant_id, new.id, null, 'totaal', case when tg_op = 'UPDATE' then old.totaal_override end, new.totaal_override, v_reden);
    new.totaal_override_door := auth.uid(); new.totaal_override_op := now();
  elsif new.totaal_override is null and tg_op = 'UPDATE' and old.totaal_override is not null then
    insert into public.prijsaanpassingen (tenant_id, offerte_id, regel_id, soort, oud, nieuw, reden)
      values (new.tenant_id, new.id, null, 'totaal', old.totaal_override, null, 'Aanpassing teruggezet');
    new.totaal_override_door := null; new.totaal_override_op := null;
  end if;
  new.totaal_override_reden := null;
  return new;
end $$;

create or replace function public.offerte_publiek(p_token text) returns jsonb
  language plpgsql stable security definer set search_path = ''
  as $$
declare
  o public.offertes;
  r jsonb;
begin
  if p_token is null or length(p_token) < 32 then return null; end if;
  select * into o from public.offertes where publiek_token = p_token and status in ('verstuurd', 'akkoord', 'vervallen');
  if not found then return null; end if;

  select jsonb_build_object(
    'bedrijf', t.naam,
    'nummer', p.nummer,
    'versie', o.versie,
    'status', o.status,
    'geldig_tot', o.geldig_tot,
    'verstuurd_op', o.verstuurd_op,
    'project_naam', p.naam,
    'klant_naam', k.naam,
    'aanhef', k.aanhef,
    'achternaam', k.achternaam,
    'adres', (select jsonb_build_object('straat', a.straat, 'huisnummer', a.huisnummer, 'toevoeging', a.toevoeging, 'postcode', a.postcode, 'plaats', a.plaats)
              from public.adressen a where a.klant_id = k.id and a.soort = 'project' limit 1),
    'eigen_totaal', o.totaal_override,
    'akkoord', (select jsonb_build_object('naam', ak.naam, 'op', ak.op, 'handtekening', ak.handtekening) from public.offerte_akkoorden ak where ak.offerte_id = o.id),
    'regels', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'soort', rg.soort,
        'titel', rg.titel,
        'tekst', rg.tekst,
        'aantal', case when rg.soort = 'positie' then ps.aantal else rg.aantal end,
        'prijs', case when rg.soort = 'positie' then coalesce(rg.prijs_override, ps.prijs)
                      when rg.soort = 'artikel' then coalesce(rg.prijs_override, rg.prijs)
                      else 0 end,
        'modus', rg.korting_modus,
        'waarde', rg.korting_waarde,
        'eenheid', ar.eenheid,
        'positie', case when ps.id is not null then jsonb_build_object('nummer', ps.nummer, 'ruimte', ps.ruimte, 'config', ps.config) end
      ) order by rg.volgorde), '[]'::jsonb)
      from public.offerte_regels rg
      left join public.posities ps on ps.id = rg.positie_id
      left join public.artikelen ar on ar.id = rg.artikel_id
      where rg.offerte_id = o.id
    )
  ) into r
  from public.tenants t, public.projecten p, public.klanten k
  where t.id = o.tenant_id and p.id = o.project_id and k.id = p.klant_id;
  return r;
end $$;

-- Nieuwe versie van een verstuurde offerte: kopieert posities, regels, aanpassingen (met reden) en eigen totaalprijs naar een nieuw concept.
-- De vorige versie vervalt en blijft bewaard; wie die link opent, ziet dat de offerte is vervangen.
alter table public.offerte_gebeurtenissen drop constraint offerte_gebeurtenissen_soort_check;
alter table public.offerte_gebeurtenissen add constraint offerte_gebeurtenissen_soort_check
  check (soort in ('verstuurd', 'geopend', 'akkoord', 'ingetrokken', 'vervangen'));

create function public.maak_nieuwe_versie(p_project uuid) returns uuid
  language plpgsql security definer set search_path = ''
  as $$
declare
  o public.offertes;
  v_nieuw uuid;
  v_nieuwe_positie uuid;
  v_map jsonb := '{}'::jsonb;
  v_totaalreden text;
  r record;
begin
  select * into o from public.offertes where project_id = p_project order by versie desc limit 1 for update;
  if not found then raise exception 'Dit project heeft geen offerte' using errcode = 'P0002'; end if;
  if not public.heeft_rol(o.tenant_id, array['directie', 'verkoop', 'kantoor']::public.gebruikersrol[]) then
    raise exception 'Je mag geen nieuwe versie maken' using errcode = '42501';
  end if;
  if o.status <> 'verstuurd' then
    raise exception 'Alleen een verstuurde offerte kan een nieuwe versie krijgen' using errcode = '55000';
  end if;

  -- Binnen deze functie slaan de controles over toestemming en catalogusprijs over: we nemen over wat er al op de vorige versie stond.
  perform set_config('kerncrm.versiekopie', 'on', true);

  update public.offertes set status = 'vervallen' where id = o.id;

  select p.reden into v_totaalreden from public.prijsaanpassingen p
    where p.offerte_id = o.id and p.soort = 'totaal' and p.nieuw is not null order by p.op desc limit 1;
  insert into public.offertes (tenant_id, project_id, versie, status)
    values (o.tenant_id, o.project_id, o.versie + 1, 'concept')
    returning id into v_nieuw;
  -- De eigen totaalprijs vullen we pas in als de offerte bestaat, zodat de aanpassing met haar reden in het logboek komt.
  if o.totaal_override is not null then
    update public.offertes set totaal_override = o.totaal_override, totaal_override_reden = coalesce(v_totaalreden, 'Overgenomen uit vorige versie') where id = v_nieuw;
  end if;

  for r in select * from public.posities where offerte_id = o.id order by nummer loop
    insert into public.posities (tenant_id, project_id, offerte_id, nummer, ruimte, aantal, config, prijs, prijsregels_versie)
      values (r.tenant_id, r.project_id, v_nieuw, r.nummer, r.ruimte, r.aantal, r.config, r.prijs, r.prijsregels_versie)
      returning id into v_nieuwe_positie;
    v_map := v_map || jsonb_build_object(r.id::text, v_nieuwe_positie::text);
  end loop;

  for r in select * from public.offerte_regels where offerte_id = o.id order by volgorde loop
    insert into public.offerte_regels (tenant_id, offerte_id, volgorde, soort, positie_id, titel, tekst, aantal, prijs, korting_modus, korting_waarde, artikel_id, catalogusprijs, prijs_override, override_reden)
      values (r.tenant_id, v_nieuw, r.volgorde, r.soort,
              case when r.positie_id is null then null else (v_map ->> r.positie_id::text)::uuid end,
              r.titel, r.tekst, r.aantal, r.prijs, r.korting_modus, r.korting_waarde, r.artikel_id, r.catalogusprijs, r.prijs_override,
              case when r.prijs_override is null then null else coalesce(
                (select p.reden from public.prijsaanpassingen p where p.regel_id = r.id and p.nieuw is not null order by p.op desc limit 1),
                'Overgenomen uit vorige versie') end);
  end loop;

  insert into public.offerte_gebeurtenissen (tenant_id, offerte_id, soort, door) values (o.tenant_id, o.id, 'vervangen', auth.uid());
  return v_nieuw;
end $$;
revoke all on function public.maak_nieuwe_versie(uuid) from public, anon;
grant execute on function public.maak_nieuwe_versie(uuid) to authenticated;
