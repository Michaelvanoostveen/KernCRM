-- Fase 3: het ISDE-subsidiedossier per project. Per project een status en per positie of ze meetellen, met de U-waarde en de m² glas.
-- De klant vraagt de subsidie zelf aan; het CRM zet de gegevens en stukken klaar. Schrijven kan alleen via de functies hieronder (directie en kantoor).

create table public.isde_dossiers (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants (id) on delete cascade,
  project_id    uuid not null unique references public.projecten (id) on delete cascade,
  status        text not null default 'niet_van_toepassing' check (status in ('niet_van_toepassing', 'klaargezet', 'aangevraagd', 'toegekend', 'afgewezen')),
  aangevraagd_op date,
  referentie    text check (referentie is null or length(referentie) <= 80),
  notitie       text check (notitie is null or length(notitie) <= 2000),
  aangemaakt    timestamptz not null default now(),
  gewijzigd     timestamptz not null default now()
);
create index isde_dossiers_tenant_idx on public.isde_dossiers (tenant_id);

create table public.isde_posities (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants (id) on delete cascade,
  dossier_id    uuid not null references public.isde_dossiers (id) on delete cascade,
  positie_id    uuid not null unique references public.posities (id) on delete cascade,
  in_aanmerking boolean not null default true,
  u_waarde      numeric(4, 2) check (u_waarde is null or (u_waarde > 0 and u_waarde <= 6)),     -- Ug-waarde van het glas volgens de leverancier
  glas_m2       numeric(8, 2) check (glas_m2 is null or (glas_m2 >= 0 and glas_m2 <= 999)),     -- leeg = schatting uit de maten
  notitie       text check (notitie is null or length(notitie) <= 500),
  gewijzigd     timestamptz not null default now()
);
create index isde_posities_tenant_idx on public.isde_posities (tenant_id);
create index isde_posities_dossier_idx on public.isde_posities (dossier_id);

alter table public.isde_dossiers enable row level security;
alter table public.isde_posities enable row level security;
create policy isde_dossiers_lezen on public.isde_dossiers for select to authenticated
  using (public.heeft_rol(tenant_id, array['directie','kantoor','verkoop']::public.gebruikersrol[]));
create policy isde_posities_lezen on public.isde_posities for select to authenticated
  using (public.heeft_rol(tenant_id, array['directie','kantoor','verkoop']::public.gebruikersrol[]));
revoke insert, update, delete, truncate on public.isde_dossiers, public.isde_posities from authenticated, anon;

-- Zet de status van het dossier (maakt het dossier aan als het er nog niet is).
create function public.isde_status_zet(p_project uuid, p_status text, p_referentie text, p_notitie text, p_datum date) returns jsonb
  language plpgsql security definer set search_path = ''
  as $$
declare
  v_tenant uuid;
begin
  select tenant_id into v_tenant from public.projecten where id = p_project;
  if v_tenant is null or not public.heeft_rol(v_tenant, array['directie','kantoor']::public.gebruikersrol[]) then
    return jsonb_build_object('ok', false, 'fout', 'geen_toegang');
  end if;
  if p_status not in ('niet_van_toepassing', 'klaargezet', 'aangevraagd', 'toegekend', 'afgewezen') then
    return jsonb_build_object('ok', false, 'fout', 'ongeldig');
  end if;
  if p_status in ('aangevraagd', 'toegekend') and p_datum is null and not exists (select 1 from public.isde_dossiers where project_id = p_project and aangevraagd_op is not null) then
    return jsonb_build_object('ok', false, 'fout', 'datum');
  end if;
  insert into public.isde_dossiers (tenant_id, project_id, status, aangevraagd_op, referentie, notitie)
    values (v_tenant, p_project, p_status, p_datum, nullif(btrim(p_referentie), ''), nullif(btrim(p_notitie), ''))
    on conflict (project_id) do update set
      status = excluded.status,
      aangevraagd_op = coalesce(excluded.aangevraagd_op, public.isde_dossiers.aangevraagd_op),
      referentie = excluded.referentie,
      notitie = excluded.notitie,
      gewijzigd = now();
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.isde_status_zet(uuid, text, text, text, date) from public, anon;
grant execute on function public.isde_status_zet(uuid, text, text, text, date) to authenticated;

-- Bewaart de ISDE-gegevens van één positie (maakt het dossier aan als het er nog niet is).
create function public.isde_positie_bewaar(p_project uuid, p_positie uuid, p_in boolean, p_u numeric, p_m2 numeric, p_notitie text) returns jsonb
  language plpgsql security definer set search_path = ''
  as $$
declare
  v_tenant uuid;
  v_dossier uuid;
begin
  select tenant_id into v_tenant from public.projecten where id = p_project;
  if v_tenant is null or not public.heeft_rol(v_tenant, array['directie','kantoor']::public.gebruikersrol[]) then
    return jsonb_build_object('ok', false, 'fout', 'geen_toegang');
  end if;
  if not exists (select 1 from public.posities where id = p_positie and project_id = p_project and tenant_id = v_tenant) then
    return jsonb_build_object('ok', false, 'fout', 'ongeldig');
  end if;
  if (p_u is not null and (p_u <= 0 or p_u > 6)) or (p_m2 is not null and (p_m2 < 0 or p_m2 > 999)) then
    return jsonb_build_object('ok', false, 'fout', 'ongeldig');
  end if;
  insert into public.isde_dossiers (tenant_id, project_id) values (v_tenant, p_project) on conflict (project_id) do nothing;
  select id into v_dossier from public.isde_dossiers where project_id = p_project;
  insert into public.isde_posities (tenant_id, dossier_id, positie_id, in_aanmerking, u_waarde, glas_m2, notitie)
    values (v_tenant, v_dossier, p_positie, coalesce(p_in, true), p_u, p_m2, nullif(btrim(p_notitie), ''))
    on conflict (positie_id) do update set in_aanmerking = excluded.in_aanmerking, u_waarde = excluded.u_waarde, glas_m2 = excluded.glas_m2, notitie = excluded.notitie, gewijzigd = now();
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.isde_positie_bewaar(uuid, uuid, boolean, numeric, numeric, text) from public, anon;
grant execute on function public.isde_positie_bewaar(uuid, uuid, boolean, numeric, numeric, text) to authenticated;
