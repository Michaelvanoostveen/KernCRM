-- Fase 2, stap 3: montageplanning. Ploegen, montages en een planbord per week.
-- Een montage is voorlopig zolang de leverdatum van de kozijnen niet bekend is en definitief zodra die er is.
-- De eerste montagedag is de dag dat de kozijnen worden geleverd: dan hoort de factuur van de 65%-termijn klaar te staan.
-- Werkdagen zijn maandag tot en met vrijdag; feestdagen houden we nog niet bij.

create table public.montageploegen (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants (id) on delete cascade,
  naam       text not null check (length(btrim(naam)) > 0),
  actief     boolean not null default true,
  aangemaakt timestamptz not null default now(),
  unique (tenant_id, naam)
);
create index montageploegen_tenant_idx on public.montageploegen (tenant_id);

create table public.montages (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants (id) on delete cascade,
  project_id    uuid not null references public.projecten (id) on delete cascade,
  offerte_id    uuid not null references public.offertes (id) on delete cascade,
  ploeg_id      uuid not null references public.montageploegen (id) on delete restrict,
  start_datum   date not null,
  werkdagen     integer not null check (werkdagen between 1 and 30),
  eind_datum    date not null,
  leverdatum    date,
  hulpmiddel    text not null default 'geen' check (hulpmiddel in ('geen', 'steiger', 'hoogwerker', 'beide')),
  status        text not null default 'voorlopig' check (status in ('voorlopig', 'definitief', 'bezig', 'afgerond', 'geannuleerd')),
  notitie       text,
  annulering_reden text,
  afgerond_op   timestamptz,
  gepland_door  uuid default auth.uid() references auth.users (id) on delete set null,
  aangemaakt    timestamptz not null default now(),
  gewijzigd     timestamptz not null default now(),
  check (eind_datum >= start_datum),
  check (extract(isodow from start_datum) < 6),
  check (leverdatum is null or leverdatum <= start_datum)
);
create index montages_tenant_idx on public.montages (tenant_id, start_datum);
create index montages_project_idx on public.montages (project_id);
create index montages_ploeg_idx on public.montages (ploeg_id, start_datum);
create index montages_offerte_idx on public.montages (offerte_id);
-- Per project hooguit één lopende montage tegelijk.
create unique index montages_een_lopend_per_project on public.montages (project_id) where status in ('voorlopig', 'definitief', 'bezig');

alter table public.montageploegen enable row level security;
alter table public.montages enable row level security;

create policy montageploegen_lezen on public.montageploegen for select to authenticated
  using (public.heeft_rol(tenant_id, array['directie','kantoor','verkoop']::public.gebruikersrol[]));
create policy montageploegen_beheren on public.montageploegen for all to authenticated
  using (public.heeft_rol(tenant_id, array['directie','kantoor']::public.gebruikersrol[]))
  with check (public.heeft_rol(tenant_id, array['directie','kantoor']::public.gebruikersrol[]));
-- De montages zelf lees je als medewerker; schrijven gaat uitsluitend via de functies hieronder.
create policy montages_lezen on public.montages for select to authenticated
  using (public.heeft_rol(tenant_id, array['directie','kantoor','verkoop']::public.gebruikersrol[]));
revoke insert, update, delete, truncate on public.montages from authenticated, anon;

-- De laatste werkdag van een montage die op een werkdag begint en p_dagen werkdagen duurt.
create function public.werkdag_eind(p_start date, p_dagen integer) returns date
  language plpgsql immutable set search_path = ''
  as $$
declare
  d date := p_start;
  n integer := 1;
begin
  if p_start is null or p_dagen is null or p_dagen < 1 or p_dagen > 30 or extract(isodow from p_start) >= 6 then
    raise exception 'Een montage begint op een werkdag en duurt 1 tot 30 werkdagen' using errcode = '22023';
  end if;
  while n < p_dagen loop
    d := d + 1;
    if extract(isodow from d) < 6 then n := n + 1; end if;
  end loop;
  return d;
end $$;
revoke all on function public.werkdag_eind(date, integer) from public, anon;
grant execute on function public.werkdag_eind(date, integer) to authenticated;

-- Is de ploeg in deze periode al ingepland (voorlopig, definitief of bezig)? Een eigen montage telt niet mee.
create function public.ploeg_bezet(p_ploeg uuid, p_start date, p_eind date, p_negeer uuid) returns boolean
  language sql stable security definer set search_path = ''
  as $$
  select exists (
    select 1 from public.montages m
    where m.ploeg_id = p_ploeg and m.status in ('voorlopig', 'definitief', 'bezig')
      and m.start_datum <= p_eind and m.eind_datum >= p_start
      and (p_negeer is null or m.id <> p_negeer)
  )
$$;
revoke all on function public.ploeg_bezet(uuid, date, date, uuid) from public, anon, authenticated;

-- Plant een montage. Kan alleen bij een getekende offerte waarvan de inmeting is afgerond (dan zijn de maten definitief).
create function public.plan_montage(
  p_project uuid, p_ploeg uuid, p_start date, p_werkdagen integer, p_leverdatum date, p_hulpmiddel text, p_notitie text
) returns jsonb
  language plpgsql security definer set search_path = ''
  as $$
declare
  p public.projecten;
  o public.offertes;
  pl public.montageploegen;
  v_eind date;
  v_vandaag date := (now() at time zone 'Europe/Amsterdam')::date;
  v_id uuid;
begin
  select * into p from public.projecten where id = p_project;
  if not found or not public.heeft_rol(p.tenant_id, array['directie','kantoor']::public.gebruikersrol[]) then
    return jsonb_build_object('ok', false, 'fout', 'geen_toegang');
  end if;
  select * into o from public.offertes where project_id = p.id order by versie desc limit 1 for update;
  if not found or o.status <> 'akkoord' then return jsonb_build_object('ok', false, 'fout', 'geen_akkoord'); end if;
  if not exists (select 1 from public.inmetingen i where i.offerte_id = o.id and i.status = 'uitgevoerd') then
    return jsonb_build_object('ok', false, 'fout', 'inmeting_open');
  end if;
  select * into pl from public.montageploegen where id = p_ploeg and tenant_id = p.tenant_id and actief for update;
  if not found then return jsonb_build_object('ok', false, 'fout', 'ploeg'); end if;
  if p_start is null or p_start < v_vandaag or extract(isodow from p_start) >= 6 or p_werkdagen is null or p_werkdagen < 1 or p_werkdagen > 30
     or (p_leverdatum is not null and p_leverdatum > p_start) or coalesce(p_hulpmiddel, 'geen') not in ('geen', 'steiger', 'hoogwerker', 'beide') then
    return jsonb_build_object('ok', false, 'fout', 'ongeldig');
  end if;
  if exists (select 1 from public.montages m where m.project_id = p.id and m.status in ('voorlopig', 'definitief', 'bezig')) then
    return jsonb_build_object('ok', false, 'fout', 'bestaat_al');
  end if;
  v_eind := public.werkdag_eind(p_start, p_werkdagen);
  if public.ploeg_bezet(pl.id, p_start, v_eind, null) then return jsonb_build_object('ok', false, 'fout', 'ploeg_bezet'); end if;
  insert into public.montages (tenant_id, project_id, offerte_id, ploeg_id, start_datum, werkdagen, eind_datum, leverdatum, hulpmiddel, status, notitie)
    values (p.tenant_id, p.id, o.id, pl.id, p_start, p_werkdagen, v_eind, p_leverdatum, coalesce(p_hulpmiddel, 'geen'),
            case when p_leverdatum is null then 'voorlopig' else 'definitief' end, left(nullif(btrim(p_notitie), ''), 1000))
    returning id into v_id;
  update public.projecten set fase = 'montage', gewijzigd = now() where id = p.id and fase in ('akkoord', 'inmeting', 'bestelling');
  return jsonb_build_object('ok', true, 'id', v_id);
exception when unique_violation then
  return jsonb_build_object('ok', false, 'fout', 'bestaat_al');
end $$;
revoke all on function public.plan_montage(uuid, uuid, date, integer, date, text, text) from public, anon;
grant execute on function public.plan_montage(uuid, uuid, date, integer, date, text, text) to authenticated;

-- Wijzigt een nog niet gestarte montage (ploeg, start, duur, leverdatum, hulpmiddel, notitie). Met een leverdatum wordt hij definitief.
create function public.wijzig_montage(
  p_montage uuid, p_ploeg uuid, p_start date, p_werkdagen integer, p_leverdatum date, p_hulpmiddel text, p_notitie text
) returns jsonb
  language plpgsql security definer set search_path = ''
  as $$
declare
  m public.montages;
  pl public.montageploegen;
  v_eind date;
  v_vandaag date := (now() at time zone 'Europe/Amsterdam')::date;
begin
  select * into m from public.montages where id = p_montage for update;
  if not found or not public.heeft_rol(m.tenant_id, array['directie','kantoor']::public.gebruikersrol[]) then
    return jsonb_build_object('ok', false, 'fout', 'geen_toegang');
  end if;
  if m.status not in ('voorlopig', 'definitief') then return jsonb_build_object('ok', false, 'fout', 'niet_te_wijzigen'); end if;
  select * into pl from public.montageploegen where id = p_ploeg and tenant_id = m.tenant_id and actief for update;
  if not found then return jsonb_build_object('ok', false, 'fout', 'ploeg'); end if;
  if p_start is null or p_start < v_vandaag or extract(isodow from p_start) >= 6 or p_werkdagen is null or p_werkdagen < 1 or p_werkdagen > 30
     or (p_leverdatum is not null and p_leverdatum > p_start) or coalesce(p_hulpmiddel, 'geen') not in ('geen', 'steiger', 'hoogwerker', 'beide') then
    return jsonb_build_object('ok', false, 'fout', 'ongeldig');
  end if;
  v_eind := public.werkdag_eind(p_start, p_werkdagen);
  if public.ploeg_bezet(pl.id, p_start, v_eind, m.id) then return jsonb_build_object('ok', false, 'fout', 'ploeg_bezet'); end if;
  update public.montages set ploeg_id = pl.id, start_datum = p_start, werkdagen = p_werkdagen, eind_datum = v_eind, leverdatum = p_leverdatum,
         hulpmiddel = coalesce(p_hulpmiddel, 'geen'), status = case when p_leverdatum is null then 'voorlopig' else 'definitief' end,
         notitie = left(nullif(btrim(p_notitie), ''), 1000), gewijzigd = now()
    where id = m.id;
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.wijzig_montage(uuid, uuid, date, integer, date, text, text) from public, anon;
grant execute on function public.wijzig_montage(uuid, uuid, date, integer, date, text, text) to authenticated;

-- De montage begint: alleen als hij definitief is (leverdatum bekend) en de startdatum is aangebroken.
create function public.start_montage(p_montage uuid) returns jsonb
  language plpgsql security definer set search_path = ''
  as $$
declare
  m public.montages;
begin
  select * into m from public.montages where id = p_montage for update;
  if not found or not public.heeft_rol(m.tenant_id, array['directie','kantoor']::public.gebruikersrol[]) then
    return jsonb_build_object('ok', false, 'fout', 'geen_toegang');
  end if;
  if m.status = 'voorlopig' then return jsonb_build_object('ok', false, 'fout', 'voorlopig'); end if;
  if m.status <> 'definitief' then return jsonb_build_object('ok', false, 'fout', 'niet_te_starten'); end if;
  if m.start_datum > (now() at time zone 'Europe/Amsterdam')::date then return jsonb_build_object('ok', false, 'fout', 'te_vroeg'); end if;
  update public.montages set status = 'bezig', gewijzigd = now() where id = m.id;
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.start_montage(uuid) from public, anon;
grant execute on function public.start_montage(uuid) to authenticated;

-- De montage is klaar: het project gaat naar de fase Oplevering.
create function public.rond_montage_af(p_montage uuid) returns jsonb
  language plpgsql security definer set search_path = ''
  as $$
declare
  m public.montages;
begin
  select * into m from public.montages where id = p_montage for update;
  if not found or not public.heeft_rol(m.tenant_id, array['directie','kantoor']::public.gebruikersrol[]) then
    return jsonb_build_object('ok', false, 'fout', 'geen_toegang');
  end if;
  if m.status <> 'bezig' then return jsonb_build_object('ok', false, 'fout', 'niet_bezig'); end if;
  update public.montages set status = 'afgerond', afgerond_op = now(), gewijzigd = now() where id = m.id;
  update public.projecten set fase = 'oplevering', gewijzigd = now() where id = m.project_id and fase = 'montage';
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.rond_montage_af(uuid) from public, anon;
grant execute on function public.rond_montage_af(uuid) to authenticated;

-- Annuleert een montage die nog niet is afgerond, met een reden. Het project gaat terug naar de fase Inmeting.
create function public.annuleer_montage(p_montage uuid, p_reden text) returns jsonb
  language plpgsql security definer set search_path = ''
  as $$
declare
  m public.montages;
begin
  select * into m from public.montages where id = p_montage for update;
  if not found or not public.heeft_rol(m.tenant_id, array['directie','kantoor']::public.gebruikersrol[]) then
    return jsonb_build_object('ok', false, 'fout', 'geen_toegang');
  end if;
  if m.status not in ('voorlopig', 'definitief', 'bezig') then return jsonb_build_object('ok', false, 'fout', 'niet_te_annuleren'); end if;
  if length(btrim(coalesce(p_reden, ''))) = 0 then return jsonb_build_object('ok', false, 'fout', 'reden'); end if;
  update public.montages set status = 'geannuleerd', annulering_reden = left(btrim(p_reden), 500), gewijzigd = now() where id = m.id;
  update public.projecten set fase = 'inmeting', gewijzigd = now() where id = m.project_id and fase = 'montage';
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.annuleer_montage(uuid, text) from public, anon;
grant execute on function public.annuleer_montage(uuid, text) to authenticated;
