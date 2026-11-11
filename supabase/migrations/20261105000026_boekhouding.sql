-- Fase 3: voorbereiding van de boekhoudkoppeling (Twinfield). Per bedrijf staat vast welke aansluiting actief is en met welke instellingen
-- (kantoorcode, dagboek, grootboekrekeningen, btw-codes; geen geheimen). Verzonden facturen en creditnota's komen in een wachtrij, zodat ze
-- later automatisch worden doorgegeven; tot de verbinding er is, boekt de medewerker ze met een export en markeert ze als verwerkt.
-- Inloggegevens van de aansluiting komen niet in deze tabellen: die volgen versleuteld per bedrijf (Supabase Vault) zodra we verbinden.

create table public.boekhoud_koppelingen (
  tenant_id    uuid primary key references public.tenants (id) on delete cascade,
  provider     text not null default 'geen' check (provider in ('geen', 'twinfield')),
  actief       boolean not null default false,
  instellingen jsonb not null default '{}'::jsonb check (jsonb_typeof(instellingen) = 'object'),
  gewijzigd    timestamptz not null default now(),
  gewijzigd_door uuid default auth.uid() references auth.users (id) on delete set null,
  check (not actief or provider <> 'geen')
);

create table public.boekhoud_wachtrij (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants (id) on delete cascade,
  soort         text not null check (soort in ('factuur', 'creditnota')),
  factuur_id    uuid references public.facturen (id) on delete restrict,
  creditnota_id uuid references public.creditnotas (id) on delete restrict,
  status        text not null default 'wachtend' check (status in ('wachtend', 'verwerkt', 'mislukt', 'overgeslagen')),
  pogingen      integer not null default 0,
  fout          text check (fout is null or length(fout) <= 1000),
  extern_ref    text check (extern_ref is null or length(extern_ref) <= 100),
  aangemaakt    timestamptz not null default now(),
  verwerkt_op   timestamptz,
  check ((soort = 'factuur' and factuur_id is not null and creditnota_id is null) or (soort = 'creditnota' and creditnota_id is not null and factuur_id is null))
);
create unique index boekhoud_wachtrij_factuur on public.boekhoud_wachtrij (factuur_id) where factuur_id is not null;
create unique index boekhoud_wachtrij_creditnota on public.boekhoud_wachtrij (creditnota_id) where creditnota_id is not null;
create index boekhoud_wachtrij_tenant_idx on public.boekhoud_wachtrij (tenant_id, status, aangemaakt desc);

alter table public.boekhoud_koppelingen enable row level security;
alter table public.boekhoud_wachtrij enable row level security;
create policy boekhoud_koppelingen_lezen on public.boekhoud_koppelingen for select to authenticated
  using (public.heeft_rol(tenant_id, array['directie','kantoor']::public.gebruikersrol[]));
create policy boekhoud_wachtrij_lezen on public.boekhoud_wachtrij for select to authenticated
  using (public.heeft_rol(tenant_id, array['directie','kantoor']::public.gebruikersrol[]));
revoke insert, update, delete, truncate on public.boekhoud_koppelingen, public.boekhoud_wachtrij from authenticated, anon;

-- Bewaart de aansluiting en de instellingen (alleen de directie). Alleen bekende sleutels met korte tekstwaarden.
create function public.boekhoud_koppeling_bewaar(p_tenant uuid, p_provider text, p_actief boolean, p_instellingen jsonb) returns jsonb
  language plpgsql security definer set search_path = ''
  as $$
declare
  v_toegestaan text[] := array['kantoorcode', 'dagboek', 'debiteurenrekening', 'omzetrekening_hoog', 'omzetrekening_laag', 'btwcode_hoog', 'btwcode_laag'];
  v_sleutel text;
begin
  if p_tenant is null or not public.heeft_rol(p_tenant, array['directie']::public.gebruikersrol[]) then
    return jsonb_build_object('ok', false, 'fout', 'geen_toegang');
  end if;
  if p_provider not in ('geen', 'twinfield') or p_instellingen is null or jsonb_typeof(p_instellingen) <> 'object' then
    return jsonb_build_object('ok', false, 'fout', 'ongeldig');
  end if;
  for v_sleutel in select jsonb_object_keys(p_instellingen) loop
    if not v_sleutel = any (v_toegestaan) or jsonb_typeof(p_instellingen -> v_sleutel) <> 'string' or length(p_instellingen ->> v_sleutel) > 40 then
      return jsonb_build_object('ok', false, 'fout', 'ongeldig');
    end if;
  end loop;
  if coalesce(p_actief, false) and p_provider = 'geen' then return jsonb_build_object('ok', false, 'fout', 'geen_provider'); end if;
  insert into public.boekhoud_koppelingen (tenant_id, provider, actief, instellingen)
    values (p_tenant, p_provider, coalesce(p_actief, false), p_instellingen)
    on conflict (tenant_id) do update set provider = excluded.provider, actief = excluded.actief, instellingen = excluded.instellingen, gewijzigd = now(), gewijzigd_door = auth.uid();
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.boekhoud_koppeling_bewaar(uuid, text, boolean, jsonb) from public, anon;
grant execute on function public.boekhoud_koppeling_bewaar(uuid, text, boolean, jsonb) to authenticated;

-- Zet een verzonden factuur of een creditnota in de wachtrij, als de aansluiting van het bedrijf actief is.
create function public.boekhoud_wachtrij_zetten() returns trigger
  language plpgsql security definer set search_path = ''
  as $$
begin
  if not exists (select 1 from public.boekhoud_koppelingen k where k.tenant_id = new.tenant_id and k.actief) then
    return new;
  end if;
  if tg_table_name = 'facturen' then
    insert into public.boekhoud_wachtrij (tenant_id, soort, factuur_id) values (new.tenant_id, 'factuur', new.id) on conflict do nothing;
  else
    insert into public.boekhoud_wachtrij (tenant_id, soort, creditnota_id) values (new.tenant_id, 'creditnota', new.id) on conflict do nothing;
  end if;
  return new;
end $$;
create trigger facturen_naar_boekhouding after update of verzonden_op on public.facturen
  for each row when (old.verzonden_op is null and new.verzonden_op is not null)
  execute function public.boekhoud_wachtrij_zetten();
create trigger creditnotas_naar_boekhouding after insert on public.creditnotas
  for each row execute function public.boekhoud_wachtrij_zetten();

-- Wordt een factuur geannuleerd nadat hij in de wachtrij kwam, dan hoort hij niet meer geboekt te worden (of, als hij al is geboekt, moet er handmatig gecorrigeerd worden).
create function public.boekhoud_factuur_geannuleerd() returns trigger
  language plpgsql security definer set search_path = ''
  as $$
begin
  update public.boekhoud_wachtrij set status = 'overgeslagen', fout = 'Factuur is geannuleerd voordat hij is geboekt.', verwerkt_op = now()
    where factuur_id = new.id and status in ('wachtend', 'mislukt');
  update public.boekhoud_wachtrij set fout = 'Let op: deze factuur is geannuleerd nadat hij is geboekt. Corrigeer de boeking in de boekhouding.'
    where factuur_id = new.id and status = 'verwerkt';
  return new;
end $$;
create trigger facturen_geannuleerd_boekhouding after update of status on public.facturen
  for each row when (new.status = 'geannuleerd' and old.status is distinct from new.status)
  execute function public.boekhoud_factuur_geannuleerd();

-- Zet alle al verzonden facturen en alle creditnota's van het bedrijf die nog niet in de wachtrij staan erin (bij het activeren van de aansluiting).
create function public.boekhoud_wachtrij_aanvullen(p_tenant uuid) returns jsonb
  language plpgsql security definer set search_path = ''
  as $$
declare
  v_f integer;
  v_c integer;
begin
  if p_tenant is null or not public.heeft_rol(p_tenant, array['directie','kantoor']::public.gebruikersrol[]) then
    return jsonb_build_object('ok', false, 'fout', 'geen_toegang');
  end if;
  if not exists (select 1 from public.boekhoud_koppelingen k where k.tenant_id = p_tenant and k.actief) then
    return jsonb_build_object('ok', false, 'fout', 'niet_actief');
  end if;
  insert into public.boekhoud_wachtrij (tenant_id, soort, factuur_id)
    select f.tenant_id, 'factuur', f.id from public.facturen f where f.tenant_id = p_tenant and f.verzonden_op is not null and f.status <> 'geannuleerd'
    on conflict do nothing;
  get diagnostics v_f = row_count;
  insert into public.boekhoud_wachtrij (tenant_id, soort, creditnota_id)
    select c.tenant_id, 'creditnota', c.id from public.creditnotas c where c.tenant_id = p_tenant
    on conflict do nothing;
  get diagnostics v_c = row_count;
  return jsonb_build_object('ok', true, 'facturen', v_f, 'creditnotas', v_c);
end $$;
revoke all on function public.boekhoud_wachtrij_aanvullen(uuid) from public, anon;
grant execute on function public.boekhoud_wachtrij_aanvullen(uuid) to authenticated;

-- Markeert een onderdeel van de wachtrij als verwerkt (bijvoorbeeld na het handmatig importeren van de export), overgeslagen of mislukt.
-- Een verwerkt onderdeel staat vast.
create function public.boekhoud_wachtrij_markeer(p_id uuid, p_status text, p_extern_ref text, p_fout text) returns jsonb
  language plpgsql security definer set search_path = ''
  as $$
declare
  w public.boekhoud_wachtrij;
begin
  select * into w from public.boekhoud_wachtrij where id = p_id for update;
  if not found or not public.heeft_rol(w.tenant_id, array['directie','kantoor']::public.gebruikersrol[]) then
    return jsonb_build_object('ok', false, 'fout', 'geen_toegang');
  end if;
  if p_status not in ('verwerkt', 'overgeslagen', 'mislukt') then return jsonb_build_object('ok', false, 'fout', 'ongeldig'); end if;
  if w.status = 'verwerkt' then return jsonb_build_object('ok', false, 'fout', 'al_verwerkt'); end if;
  update public.boekhoud_wachtrij set
    status = p_status, extern_ref = left(nullif(btrim(p_extern_ref), ''), 100), fout = case when p_status = 'verwerkt' then null else left(nullif(btrim(p_fout), ''), 1000) end,
    pogingen = pogingen + 1, verwerkt_op = case when p_status = 'mislukt' then null else now() end
    where id = w.id;
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.boekhoud_wachtrij_markeer(uuid, text, text, text) from public, anon;
grant execute on function public.boekhoud_wachtrij_markeer(uuid, text, text, text) to authenticated;
