-- Fase 1, stap 4: persoonlijke voorkeuren per gebruiker en bedrijf (bijv. gekozen kolommen in het klantenoverzicht).

create table public.gebruiker_voorkeuren (
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  tenant_id  uuid not null references public.tenants (id) on delete cascade,
  sleutel    text not null,
  waarde     jsonb not null,
  bijgewerkt timestamptz not null default now(),
  primary key (user_id, tenant_id, sleutel)
);

alter table public.gebruiker_voorkeuren enable row level security;

create policy voorkeuren_eigen on public.gebruiker_voorkeuren
  for all to authenticated
  using (user_id = auth.uid() and tenant_id in (select public.mijn_tenants()))
  with check (user_id = auth.uid() and tenant_id in (select public.mijn_tenants()));
