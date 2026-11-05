-- Fase 1, stap 7: artikelcatalogus, toestemming per gebruiker voor handmatige prijzen en vastlegging van prijsaanpassingen.

-- 1. Catalogus per bedrijf. Prijzen: excl. btw zoals in Teamleader, en incl. btw zoals op de offerte
--    (excl. x 1,174 = 21% over 70% en 9% over 30% van het bedrag excl. btw).
create table public.artikelen (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references public.tenants (id) on delete cascade,
  groep             text not null,
  code              text not null,
  naam              text not null,
  omschrijving      text,
  eenheid           text not null default 'stuk',
  verkoopprijs_excl numeric(10, 2) not null check (verkoopprijs_excl >= 0),
  verkoopprijs_incl numeric(10, 2) not null check (verkoopprijs_incl >= 0),
  btw_tarief_bron   integer,
  actief            boolean not null default true,
  aangemaakt        timestamptz not null default now(),
  gewijzigd         timestamptz not null default now(),
  unique (tenant_id, code)
);
create index artikelen_tenant_idx on public.artikelen (tenant_id, groep);
alter table public.artikelen enable row level security;

create policy artikelen_lezen on public.artikelen for select to authenticated
  using (public.heeft_rol(tenant_id, array['directie','verkoop','kantoor']::public.gebruikersrol[]));
create policy artikelen_beheren on public.artikelen for all to authenticated
  using (public.heeft_rol(tenant_id, array['directie']::public.gebruikersrol[]))
  with check (public.heeft_rol(tenant_id, array['directie']::public.gebruikersrol[]));

-- 2. Toestemming per gebruiker. De directie heeft de toestemming altijd.
alter table public.tenant_leden add column mag_prijzen_aanpassen boolean not null default false;

create function public.mag_prijzen_aanpassen(p_tenant uuid) returns boolean
  language sql stable security definer set search_path = ''
  as $$
  select exists (
    select 1 from public.tenant_leden l
    where l.tenant_id = p_tenant and l.user_id = auth.uid() and (l.rol = 'directie' or l.mag_prijzen_aanpassen)
  )
$$;
revoke all on function public.mag_prijzen_aanpassen(uuid) from public, anon;
grant execute on function public.mag_prijzen_aanpassen(uuid) to authenticated;

-- Overzicht van de gebruikers van het eigen bedrijf, alleen voor de directie (e-mailadressen staan in auth.users).
create function public.leden_overzicht() returns table (user_id uuid, email text, rol public.gebruikersrol, mag_prijzen_aanpassen boolean)
  language sql stable security definer set search_path = ''
  as $$
  select l.user_id, u.email::text, l.rol, l.mag_prijzen_aanpassen
  from public.tenant_leden l
  join auth.users u on u.id = l.user_id
  where l.tenant_id in (select t.tenant_id from public.tenant_leden t where t.user_id = auth.uid() and t.rol = 'directie')
  order by u.email
$$;
revoke all on function public.leden_overzicht() from public, anon;
grant execute on function public.leden_overzicht() to authenticated;

-- 3. Prijsaanpassing per regel en voor het totaal, met reden en vastlegging.
alter table public.offerte_regels
  add column artikel_id      uuid references public.artikelen (id) on delete set null,
  add column catalogusprijs  numeric(10, 2),
  add column prijs_override  numeric(10, 2) check (prijs_override >= 0),
  add column override_reden  text,
  add column override_door   uuid references auth.users (id) on delete set null,
  add column override_op     timestamptz,
  add constraint offerte_regels_override_reden check (prijs_override is null or length(btrim(coalesce(override_reden, ''))) > 0);

alter table public.offertes
  add column totaal_override        numeric(10, 2) check (totaal_override >= 0),
  add column totaal_override_reden  text,
  add column totaal_override_door   uuid references auth.users (id) on delete set null,
  add column totaal_override_op     timestamptz,
  add constraint offertes_override_reden check (totaal_override is null or length(btrim(coalesce(totaal_override_reden, ''))) > 0);

-- Afdwingen in de database, zodat het ook geldt buiten het scherm om.
create function public.offerte_regels_prijscontrole() returns trigger
  language plpgsql security definer set search_path = ''
  as $$
declare
  v_mag boolean := public.mag_prijzen_aanpassen(new.tenant_id);
begin
  if new.soort = 'artikel' and new.artikel_id is not null then
    -- Artikel uit de catalogus: de prijs is altijd de catalogusprijs. Afwijken kan alleen met prijs_override.
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

  if new.prijs_override is not null and (tg_op = 'INSERT' or new.prijs_override is distinct from old.prijs_override) then
    if not v_mag then
      raise exception 'Je hebt geen toestemming om prijzen handmatig aan te passen' using errcode = '42501';
    end if;
  end if;

  if new.prijs_override is null then
    new.override_reden := null; new.override_door := null; new.override_op := null;
  elsif tg_op = 'INSERT' or new.prijs_override is distinct from old.prijs_override then
    new.override_door := auth.uid(); new.override_op := now();
  end if;
  return new;
end $$;
create trigger offerte_regels_prijscontrole before insert or update on public.offerte_regels
  for each row execute function public.offerte_regels_prijscontrole();

create function public.offertes_prijscontrole() returns trigger
  language plpgsql security definer set search_path = ''
  as $$
begin
  if new.totaal_override is not null and (tg_op = 'INSERT' or new.totaal_override is distinct from old.totaal_override) then
    if not public.mag_prijzen_aanpassen(new.tenant_id) then
      raise exception 'Je hebt geen toestemming om prijzen handmatig aan te passen' using errcode = '42501';
    end if;
    new.totaal_override_door := auth.uid(); new.totaal_override_op := now();
  elsif new.totaal_override is null then
    new.totaal_override_reden := null; new.totaal_override_door := null; new.totaal_override_op := null;
  end if;
  return new;
end $$;
create trigger offertes_prijscontrole before insert or update on public.offertes
  for each row execute function public.offertes_prijscontrole();
