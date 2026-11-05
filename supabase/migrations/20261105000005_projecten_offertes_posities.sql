-- Fase 1, stap 5: projecten, offertes en posities (kozijnen), met nummering per bedrijf.
-- De positie is het hart van het systeem: dezelfde positie loopt later door naar inmeting, bestelling, montage en service.

create type public.projectfase as enum
  ('lead', 'offerte', 'akkoord', 'inmeting', 'bestelling', 'montage', 'oplevering', 'service', 'afgerond', 'verloren');
create type public.offertestatus as enum ('concept', 'verstuurd', 'akkoord', 'afgewezen', 'vervallen');

-- Nummering per bedrijf, soort en jaar (bijv. 2026-0001). Alleen toegankelijk via volgend_nummer().
create table public.nummerreeksen (
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  soort     text not null,
  jaar      integer not null,
  laatste   integer not null default 0,
  primary key (tenant_id, soort, jaar)
);
alter table public.nummerreeksen enable row level security;

create function public.volgend_nummer(p_tenant uuid, p_soort text) returns text
  language plpgsql security definer set search_path = ''
  as $$
declare
  v_jaar integer := extract(year from now() at time zone 'Europe/Amsterdam')::integer;
  v_n integer;
begin
  if p_tenant not in (select public.mijn_tenants()) then
    raise exception 'Geen toegang tot dit bedrijf' using errcode = '42501';
  end if;
  insert into public.nummerreeksen (tenant_id, soort, jaar, laatste) values (p_tenant, p_soort, v_jaar, 1)
  on conflict (tenant_id, soort, jaar) do update set laatste = public.nummerreeksen.laatste + 1
  returning laatste into v_n;
  return v_jaar::text || '-' || lpad(v_n::text, 4, '0');
end $$;
revoke all on function public.volgend_nummer(uuid, text) from public, anon;
grant execute on function public.volgend_nummer(uuid, text) to authenticated;

create table public.projecten (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants (id) on delete cascade,
  klant_id    uuid not null references public.klanten (id) on delete cascade,
  nummer      text not null,
  naam        text not null,
  fase        public.projectfase not null default 'lead',
  verkoper_id uuid default auth.uid() references auth.users (id) on delete set null,
  aangemaakt  timestamptz not null default now(),
  gewijzigd   timestamptz not null default now(),
  unique (tenant_id, nummer)
);
create index projecten_tenant_idx on public.projecten (tenant_id);
create index projecten_klant_idx on public.projecten (klant_id);

create table public.offertes (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants (id) on delete cascade,
  project_id  uuid not null references public.projecten (id) on delete cascade,
  versie      integer not null default 1,
  status      public.offertestatus not null default 'concept',
  aangemaakt  timestamptz not null default now(),
  unique (project_id, versie)
);
create index offertes_tenant_idx on public.offertes (tenant_id);
create index offertes_project_idx on public.offertes (project_id);

create table public.posities (
  id                    uuid primary key default gen_random_uuid(),
  tenant_id             uuid not null references public.tenants (id) on delete cascade,
  project_id            uuid not null references public.projecten (id) on delete cascade,
  offerte_id            uuid not null references public.offertes (id) on delete cascade,
  nummer                integer not null,
  ruimte                text,
  aantal                integer not null default 1 check (aantal between 1 and 999),
  config                jsonb not null,
  prijs                 numeric(10, 2) not null check (prijs >= 0),
  prijsregels_versie    text not null,
  aangemaakt            timestamptz not null default now(),
  gewijzigd             timestamptz not null default now(),
  unique (offerte_id, nummer)
);
create index posities_tenant_idx on public.posities (tenant_id);
create index posities_project_idx on public.posities (project_id);
create index posities_offerte_idx on public.posities (offerte_id);

alter table public.projecten enable row level security;
alter table public.offertes enable row level security;
alter table public.posities enable row level security;

create policy projecten_beheren on public.projecten for all to authenticated
  using (public.heeft_rol(tenant_id, array['directie','verkoop','kantoor']::public.gebruikersrol[]))
  with check (
    public.heeft_rol(tenant_id, array['directie','verkoop','kantoor']::public.gebruikersrol[])
    and exists (select 1 from public.klanten k where k.id = klant_id and k.tenant_id = projecten.tenant_id)
  );

create policy offertes_beheren on public.offertes for all to authenticated
  using (public.heeft_rol(tenant_id, array['directie','verkoop','kantoor']::public.gebruikersrol[]))
  with check (
    public.heeft_rol(tenant_id, array['directie','verkoop','kantoor']::public.gebruikersrol[])
    and exists (select 1 from public.projecten p where p.id = project_id and p.tenant_id = offertes.tenant_id)
  );

create policy posities_beheren on public.posities for all to authenticated
  using (public.heeft_rol(tenant_id, array['directie','verkoop','kantoor']::public.gebruikersrol[]))
  with check (
    public.heeft_rol(tenant_id, array['directie','verkoop','kantoor']::public.gebruikersrol[])
    and exists (select 1 from public.offertes o where o.id = offerte_id and o.project_id = posities.project_id and o.tenant_id = posities.tenant_id)
  );
