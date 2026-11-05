-- Fase 1, stap 6: een offerte is een geordende lijst met regels (posities, artikelen, koppen, tekst, korting).

create type public.offerteregelsoort as enum ('positie', 'artikel', 'kop', 'tekst', 'korting');

alter table public.offertes add column gewijzigd timestamptz not null default now();

create table public.offerte_regels (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants (id) on delete cascade,
  offerte_id     uuid not null references public.offertes (id) on delete cascade,
  volgorde       integer not null,
  soort          public.offerteregelsoort not null,
  positie_id     uuid references public.posities (id) on delete cascade,
  titel          text,
  tekst          text,
  aantal         numeric(10, 2) not null default 1 check (aantal > 0),
  prijs          numeric(10, 2) not null default 0 check (prijs >= 0),
  korting_modus  text check (korting_modus in ('percentage', 'bedrag')),
  korting_waarde numeric(10, 2) check (korting_waarde >= 0),
  aangemaakt     timestamptz not null default now(),
  gewijzigd      timestamptz not null default now(),
  unique (positie_id),
  check ((soort = 'positie') = (positie_id is not null)),
  check (soort <> 'korting' or (korting_modus is not null and korting_waarde is not null))
);
create index offerte_regels_tenant_idx on public.offerte_regels (tenant_id);
create index offerte_regels_offerte_idx on public.offerte_regels (offerte_id, volgorde);

alter table public.offerte_regels enable row level security;

create policy offerte_regels_beheren on public.offerte_regels for all to authenticated
  using (public.heeft_rol(tenant_id, array['directie','verkoop','kantoor']::public.gebruikersrol[]))
  with check (
    public.heeft_rol(tenant_id, array['directie','verkoop','kantoor']::public.gebruikersrol[])
    and exists (select 1 from public.offertes o where o.id = offerte_id and o.tenant_id = offerte_regels.tenant_id)
    and (positie_id is null or exists (
      select 1 from public.posities p where p.id = positie_id and p.offerte_id = offerte_regels.offerte_id and p.tenant_id = offerte_regels.tenant_id))
  );

-- Bestaande posities komen als regels in de offerte, in de volgorde van hun positienummer.
insert into public.offerte_regels (tenant_id, offerte_id, volgorde, soort, positie_id)
select tenant_id, offerte_id, nummer, 'positie', id from public.posities
on conflict (positie_id) do nothing;
