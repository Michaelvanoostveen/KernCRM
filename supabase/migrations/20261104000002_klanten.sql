-- Fase 1, stap 2: klantbestand met adressen.

create type public.klanttype as enum ('particulier', 'vve', 'aannemer', 'woningcorporatie', 'zakelijk');
create type public.adressoort as enum ('factuur', 'project');

create table public.klanten (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants (id) on delete cascade,
  type        public.klanttype not null default 'particulier',
  naam        text not null,
  email       text,
  telefoon    text,
  herkomst    text,
  notitie     text,
  aangemaakt  timestamptz not null default now(),
  gewijzigd   timestamptz not null default now()
);
create index klanten_tenant_idx on public.klanten (tenant_id);
create index klanten_email_idx on public.klanten (tenant_id, lower(email));

create table public.adressen (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants (id) on delete cascade,
  klant_id      uuid not null references public.klanten (id) on delete cascade,
  soort         public.adressoort not null,
  straat        text not null,
  huisnummer    text not null,
  postcode      text not null,
  plaats        text not null,
  in_montagegebied boolean,
  aangemaakt    timestamptz not null default now()
);
create index adressen_tenant_idx on public.adressen (tenant_id);
create index adressen_klant_idx on public.adressen (klant_id);
create index adressen_postcode_idx on public.adressen (tenant_id, postcode, huisnummer);

alter table public.klanten enable row level security;
alter table public.adressen enable row level security;

-- Directie, verkoop en kantoor beheren klanten; inmeters en monteurs lezen later alleen via hun toegewezen klussen.
create policy klanten_lezen on public.klanten
  for select to authenticated
  using (public.heeft_rol(tenant_id, array['directie','verkoop','kantoor']::public.gebruikersrol[]));
create policy klanten_beheren on public.klanten
  for all to authenticated
  using (public.heeft_rol(tenant_id, array['directie','verkoop','kantoor']::public.gebruikersrol[]))
  with check (public.heeft_rol(tenant_id, array['directie','verkoop','kantoor']::public.gebruikersrol[]));

create policy adressen_lezen on public.adressen
  for select to authenticated
  using (public.heeft_rol(tenant_id, array['directie','verkoop','kantoor']::public.gebruikersrol[]));
create policy adressen_beheren on public.adressen
  for all to authenticated
  using (public.heeft_rol(tenant_id, array['directie','verkoop','kantoor']::public.gebruikersrol[]))
  with check (
    public.heeft_rol(tenant_id, array['directie','verkoop','kantoor']::public.gebruikersrol[])
    and exists (select 1 from public.klanten k where k.id = klant_id and k.tenant_id = adressen.tenant_id)
  );
