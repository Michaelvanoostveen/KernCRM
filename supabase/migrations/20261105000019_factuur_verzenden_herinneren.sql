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
end $$;
revoke all on function public.registreer_herinnering(uuid) from public, anon;
grant execute on function public.registreer_herinnering(uuid) to authenticated;
