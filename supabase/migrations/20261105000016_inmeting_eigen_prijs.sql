-- Fase 2, stap 3: eigen prijs bij meerwerk tijdens de inmeting.
-- Wie daarvoor toestemming heeft (zelfde toestemming als bij offertes) mag de berekende meerprijs vervangen door een eigen prijs.
-- De klant en de lijst op het scherm tonen alleen de uiteindelijke prijs. Het voorstel, de eigen prijs en de reden staan
-- uitsluitend in een logboek dat alleen de directie mag lezen.

create table public.inmeting_prijsaanpassingen (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants (id) on delete cascade,
  inmeting_id   uuid not null references public.inmetingen (id) on delete cascade,
  wijziging_id  uuid not null references public.inmeting_wijzigingen (id) on delete cascade,
  oud           numeric(10, 2) not null,   -- het voorstel: berekend door de prijsmodule of uit de catalogus
  nieuw         numeric(10, 2) not null,   -- de eigen prijs, incl. btw, voor het totale aantal
  reden         text not null check (length(btrim(reden)) > 0),
  door          uuid default auth.uid() references auth.users (id) on delete set null,
  op            timestamptz not null default now()
);
create index inmeting_prijsaanpassingen_inmeting_idx on public.inmeting_prijsaanpassingen (inmeting_id);
create index inmeting_prijsaanpassingen_wijziging_idx on public.inmeting_prijsaanpassingen (wijziging_id);
create index inmeting_prijsaanpassingen_tenant_idx on public.inmeting_prijsaanpassingen (tenant_id);
alter table public.inmeting_prijsaanpassingen enable row level security;
create policy inmeting_prijsaanpassingen_lezen on public.inmeting_prijsaanpassingen for select to authenticated
  using (public.heeft_rol(tenant_id, array['directie']::public.gebruikersrol[]));

-- Heeft de ingelogde gebruiker toestemming om bij deze inmeting een eigen prijs in te voeren?
create function public.inmeting_mag_prijzen(p_inmeting uuid) returns boolean
  language sql stable security definer set search_path = ''
  as $$
  select public.inmeting_toegang(p_inmeting)
    and public.mag_prijzen_aanpassen((select i.tenant_id from public.inmetingen i where i.id = p_inmeting))
$$;
revoke all on function public.inmeting_mag_prijzen(uuid) from public, anon;
grant execute on function public.inmeting_mag_prijzen(uuid) to authenticated;

drop function public.inmeting_stel_config_voor(uuid, uuid, jsonb, text, numeric);
create function public.inmeting_stel_config_voor(
  p_inmeting uuid, p_positie uuid, p_config jsonb, p_omschrijving text, p_meerprijs numeric,
  p_eigen_prijs numeric default null, p_reden text default null
) returns jsonb
  language plpgsql security definer set search_path = ''
  as $$
declare
  i public.inmetingen;
  v_prijs numeric(10, 2);
  v_id uuid;
begin
  if not public.inmeting_toegang(p_inmeting) then return jsonb_build_object('ok', false, 'fout', 'geen_toegang'); end if;
  select * into i from public.inmetingen where id = p_inmeting for update;
  if i.status <> 'gepland' then return jsonb_build_object('ok', false, 'fout', 'afgerond'); end if;
  if not exists (select 1 from public.posities ps where ps.id = p_positie and ps.offerte_id = i.offerte_id and ps.tenant_id = i.tenant_id) then
    return jsonb_build_object('ok', false, 'fout', 'positie');
  end if;
  if p_config is null or jsonb_typeof(p_config) <> 'object' or length(p_config::text) > 4000 or p_meerprijs is null or abs(p_meerprijs) > 1000000
     or length(btrim(coalesce(p_omschrijving, ''))) = 0 then
    return jsonb_build_object('ok', false, 'fout', 'ongeldig');
  end if;
  if exists (
    select 1 from public.posities ps, unnest(array['product', 'w', 'h', 'beslag', 'binnen', 'profiel']) k
    where ps.id = p_positie and (p_config -> k) is distinct from (ps.config -> k)
  ) then
    return jsonb_build_object('ok', false, 'fout', 'ongeldig');
  end if;
  if exists (select 1 from public.inmeting_wijzigingen where inmeting_id = i.id and positie_id = p_positie and soort = 'configuratie' and status = 'akkoord') then
    return jsonb_build_object('ok', false, 'fout', 'al_akkoord');
  end if;
  v_prijs := round(p_meerprijs, 2);
  if p_eigen_prijs is not null then
    if not public.mag_prijzen_aanpassen(i.tenant_id) then return jsonb_build_object('ok', false, 'fout', 'geen_toestemming'); end if;
    if abs(p_eigen_prijs) > 1000000 then return jsonb_build_object('ok', false, 'fout', 'ongeldig'); end if;
    if length(btrim(coalesce(p_reden, ''))) = 0 then return jsonb_build_object('ok', false, 'fout', 'reden'); end if;
  end if;
  update public.inmeting_wijzigingen set status = 'vervallen'
    where inmeting_id = i.id and positie_id = p_positie and soort = 'configuratie' and status = 'voorgesteld';
  insert into public.inmeting_wijzigingen (tenant_id, inmeting_id, positie_id, soort, nieuwe_config, omschrijving, meerprijs, voorgesteld_door)
    values (i.tenant_id, i.id, p_positie, 'configuratie', p_config, left(btrim(p_omschrijving), 500), coalesce(round(p_eigen_prijs, 2), v_prijs), auth.uid())
    returning id into v_id;
  if p_eigen_prijs is not null and round(p_eigen_prijs, 2) <> v_prijs then
    insert into public.inmeting_prijsaanpassingen (tenant_id, inmeting_id, wijziging_id, oud, nieuw, reden)
      values (i.tenant_id, i.id, v_id, v_prijs, round(p_eigen_prijs, 2), left(btrim(p_reden), 1000));
  end if;
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.inmeting_stel_config_voor(uuid, uuid, jsonb, text, numeric, numeric, text) from public, anon;
grant execute on function public.inmeting_stel_config_voor(uuid, uuid, jsonb, text, numeric, numeric, text) to authenticated;

drop function public.inmeting_voeg_extra_toe(uuid, uuid, uuid, integer);
create function public.inmeting_voeg_extra_toe(
  p_inmeting uuid, p_positie uuid, p_artikel uuid, p_aantal integer,
  p_eigen_prijs numeric default null, p_reden text default null
) returns jsonb
  language plpgsql security definer set search_path = ''
  as $$
declare
  i public.inmetingen;
  a public.artikelen;
  v_prijs numeric(10, 2);
  v_id uuid;
begin
  if not public.inmeting_toegang(p_inmeting) then return jsonb_build_object('ok', false, 'fout', 'geen_toegang'); end if;
  select * into i from public.inmetingen where id = p_inmeting for update;
  if i.status <> 'gepland' then return jsonb_build_object('ok', false, 'fout', 'afgerond'); end if;
  if p_aantal is null or p_aantal < 1 or p_aantal > 100 then return jsonb_build_object('ok', false, 'fout', 'aantal'); end if;
  if (select count(*) from public.inmeting_wijzigingen where inmeting_id = i.id and soort = 'extra') >= 30 then
    return jsonb_build_object('ok', false, 'fout', 'te_veel');
  end if;
  select * into a from public.artikelen where id = p_artikel and tenant_id = i.tenant_id and actief;
  if not found then return jsonb_build_object('ok', false, 'fout', 'artikel'); end if;
  if p_positie is not null and not exists (select 1 from public.posities ps where ps.id = p_positie and ps.offerte_id = i.offerte_id and ps.tenant_id = i.tenant_id) then
    return jsonb_build_object('ok', false, 'fout', 'positie');
  end if;
  if a.verkoopprijs_incl * p_aantal > 100000 then return jsonb_build_object('ok', false, 'fout', 'artikel'); end if;
  v_prijs := round(a.verkoopprijs_incl * p_aantal, 2);
  if p_eigen_prijs is not null then
    if not public.mag_prijzen_aanpassen(i.tenant_id) then return jsonb_build_object('ok', false, 'fout', 'geen_toestemming'); end if;
    if abs(p_eigen_prijs) > 1000000 then return jsonb_build_object('ok', false, 'fout', 'ongeldig'); end if;
    if length(btrim(coalesce(p_reden, ''))) = 0 then return jsonb_build_object('ok', false, 'fout', 'reden'); end if;
  end if;
  insert into public.inmeting_wijzigingen (tenant_id, inmeting_id, positie_id, soort, artikel_id, aantal, omschrijving, meerprijs, voorgesteld_door)
    values (i.tenant_id, i.id, p_positie, 'extra', a.id, p_aantal, a.naam, coalesce(round(p_eigen_prijs, 2), v_prijs), auth.uid())
    returning id into v_id;
  if p_eigen_prijs is not null and round(p_eigen_prijs, 2) <> v_prijs then
    insert into public.inmeting_prijsaanpassingen (tenant_id, inmeting_id, wijziging_id, oud, nieuw, reden)
      values (i.tenant_id, i.id, v_id, v_prijs, round(p_eigen_prijs, 2), left(btrim(p_reden), 1000));
  end if;
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.inmeting_voeg_extra_toe(uuid, uuid, uuid, integer, numeric, text) from public, anon;
grant execute on function public.inmeting_voeg_extra_toe(uuid, uuid, uuid, integer, numeric, text) to authenticated;
