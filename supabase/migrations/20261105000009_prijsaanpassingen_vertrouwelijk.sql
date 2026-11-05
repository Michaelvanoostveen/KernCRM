-- Fase 1, stap 9: de reden van een handmatige prijsaanpassing is alleen voor de directie leesbaar.
-- De reden staat niet meer op de offerteregel maar in een logboek dat alleen de directie mag lezen.

create table public.prijsaanpassingen (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants (id) on delete cascade,
  offerte_id  uuid not null references public.offertes (id) on delete cascade,
  regel_id    uuid,                                  -- leeg bij een aanpassing van de totaalprijs
  soort       text not null check (soort in ('regel', 'totaal')),
  oud         numeric(10, 2),                        -- prijs per stuk (regel) of totaalprijs vóór de aanpassing
  nieuw       numeric(10, 2),                        -- leeg als de aanpassing is teruggezet
  reden       text not null check (length(btrim(reden)) > 0),
  door        uuid default auth.uid() references auth.users (id) on delete set null,
  op          timestamptz not null default now()
);
create index prijsaanpassingen_offerte_idx on public.prijsaanpassingen (offerte_id, op desc);
alter table public.prijsaanpassingen enable row level security;

-- Alleen lezen, alleen door de directie. Schrijven gebeurt uitsluitend via de triggers hieronder.
create policy prijsaanpassingen_lezen on public.prijsaanpassingen for select to authenticated
  using (public.heeft_rol(tenant_id, array['directie']::public.gebruikersrol[]));

-- De bestaande redenen verhuizen naar het logboek.
alter table public.offerte_regels drop constraint offerte_regels_override_reden;
alter table public.offertes drop constraint offertes_override_reden;

insert into public.prijsaanpassingen (tenant_id, offerte_id, regel_id, soort, oud, nieuw, reden, door, op)
select tenant_id, offerte_id, id, 'regel', null, prijs_override, override_reden, override_door, coalesce(override_op, now())
from public.offerte_regels where prijs_override is not null and length(btrim(coalesce(override_reden, ''))) > 0;

insert into public.prijsaanpassingen (tenant_id, offerte_id, regel_id, soort, oud, nieuw, reden, door, op)
select tenant_id, id, null, 'totaal', null, totaal_override, totaal_override_reden, totaal_override_door, coalesce(totaal_override_op, now())
from public.offertes where totaal_override is not null and length(btrim(coalesce(totaal_override_reden, ''))) > 0;

update public.offerte_regels set override_reden = null where override_reden is not null;
update public.offertes set totaal_override_reden = null where totaal_override_reden is not null;

create or replace function public.offerte_regels_prijscontrole() returns trigger
  language plpgsql security definer set search_path = ''
  as $$
declare
  v_mag boolean := public.mag_prijzen_aanpassen(new.tenant_id);
  v_basis numeric(10, 2);
  v_oud numeric(10, 2);
  v_reden text := btrim(coalesce(new.override_reden, ''));
begin
  if new.soort = 'artikel' and new.artikel_id is not null then
    select a.verkoopprijs_incl into new.catalogusprijs from public.artikelen a where a.id = new.artikel_id and a.tenant_id = new.tenant_id;
    if new.catalogusprijs is null then
      raise exception 'Dit artikel bestaat niet in de catalogus' using errcode = '23503';
    end if;
    new.prijs := new.catalogusprijs;
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
begin
  if new.totaal_override is not null and (tg_op = 'INSERT' or new.totaal_override is distinct from old.totaal_override) then
    if not public.mag_prijzen_aanpassen(new.tenant_id) then
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
