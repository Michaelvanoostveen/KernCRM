-- Fase 1, stap 1: tenants, lidmaatschappen en rollen. RLS staat aan vanaf het begin.

create type public.gebruikersrol as enum ('directie', 'verkoop', 'kantoor', 'inmeter', 'monteur');

create table public.tenants (
  id          uuid primary key default gen_random_uuid(),
  naam        text not null,
  slug        text not null unique,
  aangemaakt  timestamptz not null default now()
);

create table public.tenant_leden (
  tenant_id   uuid not null references public.tenants (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  rol         public.gebruikersrol not null,
  aangemaakt  timestamptz not null default now(),
  primary key (tenant_id, user_id)
);
create index tenant_leden_user_idx on public.tenant_leden (user_id);

-- Hulpfuncties voor policies. security definer zodat ze tenant_leden lezen zonder zelf door RLS geblokkeerd te worden.
create function public.mijn_tenants() returns setof uuid
  language sql stable security definer set search_path = ''
  as $$ select tenant_id from public.tenant_leden where user_id = auth.uid() $$;

create function public.heeft_rol(p_tenant uuid, p_rollen public.gebruikersrol[]) returns boolean
  language sql stable security definer set search_path = ''
  as $$ select exists (
    select 1 from public.tenant_leden
    where tenant_id = p_tenant and user_id = auth.uid() and rol = any (p_rollen)
  ) $$;

revoke all on function public.mijn_tenants() from public, anon;
revoke all on function public.heeft_rol(uuid, public.gebruikersrol[]) from public, anon;
grant execute on function public.mijn_tenants() to authenticated;
grant execute on function public.heeft_rol(uuid, public.gebruikersrol[]) to authenticated;

alter table public.tenants enable row level security;
alter table public.tenant_leden enable row level security;

create policy tenants_lezen on public.tenants
  for select to authenticated using (id in (select public.mijn_tenants()));
create policy tenants_wijzigen on public.tenants
  for update to authenticated
  using (public.heeft_rol(id, array['directie']::public.gebruikersrol[]))
  with check (public.heeft_rol(id, array['directie']::public.gebruikersrol[]));

create policy leden_lezen on public.tenant_leden
  for select to authenticated using (tenant_id in (select public.mijn_tenants()));
create policy leden_beheren on public.tenant_leden
  for all to authenticated
  using (public.heeft_rol(tenant_id, array['directie']::public.gebruikersrol[]))
  with check (public.heeft_rol(tenant_id, array['directie']::public.gebruikersrol[]));
