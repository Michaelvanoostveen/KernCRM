-- Fase 2, stap 1: inmeting plannen en de inmeetstaat invullen.
-- De inmeter krijgt geen toegang tot de tabellen, maar tot een paar functies die alleen de gegevens teruggeven die nodig zijn
-- (nooit prijzen). Medewerkers met schrijfrechten gebruiken dezelfde functies of de tabellen zelf.

create type public.inmetingstatus as enum ('gepland', 'uitgevoerd', 'geannuleerd');

create table public.inmetingen (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants (id) on delete cascade,
  project_id    uuid not null references public.projecten (id) on delete cascade,
  offerte_id    uuid not null references public.offertes (id) on delete cascade,
  gepland_op    timestamptz not null,
  inmeter_id    uuid references auth.users (id) on delete set null,
  status        public.inmetingstatus not null default 'gepland',
  notitie       text,
  uitgevoerd_op timestamptz,
  aangemaakt    timestamptz not null default now(),
  gewijzigd     timestamptz not null default now()
);
create index inmetingen_tenant_idx on public.inmetingen (tenant_id, gepland_op);
create index inmetingen_project_idx on public.inmetingen (project_id);
create index inmetingen_inmeter_idx on public.inmetingen (inmeter_id, gepland_op);

create table public.inmeting_regels (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references public.tenants (id) on delete cascade,
  inmeting_id      uuid not null references public.inmetingen (id) on delete cascade,
  positie_id       uuid not null references public.posities (id) on delete cascade,
  breedte_mm       integer check (breedte_mm between 100 and 10000),
  hoogte_mm        integer check (hoogte_mm between 100 and 10000),
  dag_breedte_mm   integer check (dag_breedte_mm between 100 and 10000),
  dag_hoogte_mm    integer check (dag_hoogte_mm between 100 and 10000),
  opmerking        text,
  bijgewerkt       timestamptz not null default now(),
  unique (inmeting_id, positie_id)
);
create index inmeting_regels_inmeting_idx on public.inmeting_regels (inmeting_id);

alter table public.inmetingen enable row level security;
alter table public.inmeting_regels enable row level security;

create policy inmetingen_beheren on public.inmetingen for all to authenticated
  using (public.heeft_rol(tenant_id, array['directie','verkoop','kantoor']::public.gebruikersrol[]))
  with check (
    public.heeft_rol(tenant_id, array['directie','verkoop','kantoor']::public.gebruikersrol[])
    and exists (select 1 from public.offertes o where o.id = offerte_id and o.project_id = inmetingen.project_id and o.tenant_id = inmetingen.tenant_id and o.status = 'akkoord')
  );
create policy inmeting_regels_beheren on public.inmeting_regels for all to authenticated
  using (public.heeft_rol(tenant_id, array['directie','verkoop','kantoor']::public.gebruikersrol[]))
  with check (
    public.heeft_rol(tenant_id, array['directie','verkoop','kantoor']::public.gebruikersrol[])
    and exists (select 1 from public.inmetingen i where i.id = inmeting_id and i.tenant_id = inmeting_regels.tenant_id)
  );

-- Wie mag je als inmeter kiezen? De medewerkers van het eigen bedrijf, voor iedereen die mag plannen.
create function public.leden_voor_planning() returns table (user_id uuid, email text, rol public.gebruikersrol)
  language sql stable security definer set search_path = ''
  as $$
  select l.user_id, u.email::text, l.rol
  from public.tenant_leden l
  join auth.users u on u.id = l.user_id
  where l.tenant_id in (
    select t.tenant_id from public.tenant_leden t
    where t.user_id = auth.uid() and t.rol in ('directie', 'verkoop', 'kantoor')
  )
  order by u.email
$$;
revoke all on function public.leden_voor_planning() from public, anon;
grant execute on function public.leden_voor_planning() to authenticated;

-- Mag de ingelogde gebruiker deze inmeting zien en invullen? De toegewezen inmeter, of een medewerker met schrijfrechten.
create function public.inmeting_toegang(p_inmeting uuid) returns boolean
  language sql stable security definer set search_path = ''
  as $$
  select exists (
    select 1 from public.inmetingen i
    where i.id = p_inmeting
      and (
        i.inmeter_id = auth.uid()
        or public.heeft_rol(i.tenant_id, array['directie','verkoop','kantoor']::public.gebruikersrol[])
      )
  )
$$;
revoke all on function public.inmeting_toegang(uuid) from public, anon;
grant execute on function public.inmeting_toegang(uuid) to authenticated;

-- Overzicht voor de inmeter (alleen eigen inmetingen) of voor medewerkers (alle inmetingen van het bedrijf). Zonder prijzen.
create function public.inmeting_overzicht() returns jsonb
  language sql stable security definer set search_path = ''
  as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', i.id,
    'gepland_op', i.gepland_op,
    'status', i.status,
    'project_naam', p.naam,
    'project_nummer', p.nummer,
    'klant_naam', k.naam,
    'plaats', (select a.plaats from public.adressen a where a.klant_id = k.id and a.soort = 'project' limit 1),
    'adres', (select a.straat || ' ' || a.huisnummer || coalesce(' ' || a.toevoeging, '') from public.adressen a where a.klant_id = k.id and a.soort = 'project' limit 1),
    'aantal_posities', (select count(*) from public.posities ps where ps.offerte_id = i.offerte_id),
    'ingevuld', (select count(*) from public.inmeting_regels r where r.inmeting_id = i.id and r.breedte_mm is not null and r.hoogte_mm is not null)
  ) order by i.gepland_op), '[]'::jsonb)
  from public.inmetingen i
  join public.projecten p on p.id = i.project_id
  join public.klanten k on k.id = p.klant_id
  where i.status <> 'geannuleerd'
    and (
      i.inmeter_id = auth.uid()
      or public.heeft_rol(i.tenant_id, array['directie','verkoop','kantoor']::public.gebruikersrol[])
    )
$$;
revoke all on function public.inmeting_overzicht() from public, anon;
grant execute on function public.inmeting_overzicht() to authenticated;

-- Alles wat nodig is om in te meten: adres, contact, per positie de tekening en de offertemaat, en wat al is ingevuld. Nooit prijzen.
create function public.inmeting_detail(p_inmeting uuid) returns jsonb
  language plpgsql stable security definer set search_path = ''
  as $$
declare
  v_json jsonb;
begin
  if not public.inmeting_toegang(p_inmeting) then return null; end if;
  select jsonb_build_object(
    'id', i.id,
    'status', i.status,
    'gepland_op', i.gepland_op,
    'notitie', i.notitie,
    'project_id', p.id,
    'project_nummer', p.nummer,
    'project_naam', p.naam,
    'klant_naam', k.naam,
    'telefoon', k.telefoon,
    'mobiel', k.mobiel,
    'adres', (select jsonb_build_object('straat', a.straat, 'huisnummer', a.huisnummer, 'toevoeging', a.toevoeging, 'postcode', a.postcode, 'plaats', a.plaats, 'bereikbaarheid', a.bereikbaarheid, 'woningtype', a.woningtype, 'bouwjaar', a.bouwjaar)
              from public.adressen a where a.klant_id = k.id and a.soort = 'project' limit 1),
    'posities', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'positie_id', ps.id,
        'nummer', ps.nummer,
        'ruimte', ps.ruimte,
        'aantal', ps.aantal,
        'config', ps.config,
        'gemeten', (select jsonb_build_object('breedte_mm', r.breedte_mm, 'hoogte_mm', r.hoogte_mm, 'dag_breedte_mm', r.dag_breedte_mm, 'dag_hoogte_mm', r.dag_hoogte_mm, 'opmerking', r.opmerking)
                    from public.inmeting_regels r where r.inmeting_id = i.id and r.positie_id = ps.id)
      ) order by ps.nummer), '[]'::jsonb)
      from public.posities ps where ps.offerte_id = i.offerte_id
    )
  ) into v_json
  from public.inmetingen i
  join public.projecten p on p.id = i.project_id
  join public.klanten k on k.id = p.klant_id
  where i.id = p_inmeting;
  return v_json;
end $$;
revoke all on function public.inmeting_detail(uuid) from public, anon;
grant execute on function public.inmeting_detail(uuid) to authenticated;

-- Slaat de gemeten maten van één positie op.
create function public.inmeting_bewaar_positie(
  p_inmeting uuid, p_positie uuid, p_breedte integer, p_hoogte integer, p_dag_breedte integer, p_dag_hoogte integer, p_opmerking text
) returns jsonb
  language plpgsql security definer set search_path = ''
  as $$
declare
  i public.inmetingen;
begin
  if not public.inmeting_toegang(p_inmeting) then return jsonb_build_object('ok', false, 'fout', 'geen_toegang'); end if;
  select * into i from public.inmetingen where id = p_inmeting for update;
  if i.status <> 'gepland' then return jsonb_build_object('ok', false, 'fout', 'afgerond'); end if;
  if not exists (select 1 from public.posities ps where ps.id = p_positie and ps.offerte_id = i.offerte_id) then
    return jsonb_build_object('ok', false, 'fout', 'positie');
  end if;
  insert into public.inmeting_regels (tenant_id, inmeting_id, positie_id, breedte_mm, hoogte_mm, dag_breedte_mm, dag_hoogte_mm, opmerking)
    values (i.tenant_id, i.id, p_positie, p_breedte, p_hoogte, p_dag_breedte, p_dag_hoogte, left(nullif(btrim(p_opmerking), ''), 2000))
  on conflict (inmeting_id, positie_id) do update set
    breedte_mm = excluded.breedte_mm, hoogte_mm = excluded.hoogte_mm, dag_breedte_mm = excluded.dag_breedte_mm,
    dag_hoogte_mm = excluded.dag_hoogte_mm, opmerking = excluded.opmerking, bijgewerkt = now();
  update public.inmetingen set gewijzigd = now() where id = i.id;
  return jsonb_build_object('ok', true);
exception when check_violation then
  return jsonb_build_object('ok', false, 'fout', 'maat');
end $$;
revoke all on function public.inmeting_bewaar_positie(uuid, uuid, integer, integer, integer, integer, text) from public, anon;
grant execute on function public.inmeting_bewaar_positie(uuid, uuid, integer, integer, integer, integer, text) to authenticated;

-- Rondt de inmeting af. Kan alleen als bij elke positie een breedte en hoogte is ingevuld.
create function public.inmeting_afronden(p_inmeting uuid) returns jsonb
  language plpgsql security definer set search_path = ''
  as $$
declare
  i public.inmetingen;
  v_open integer;
begin
  if not public.inmeting_toegang(p_inmeting) then return jsonb_build_object('ok', false, 'fout', 'geen_toegang'); end if;
  select * into i from public.inmetingen where id = p_inmeting for update;
  if i.status <> 'gepland' then return jsonb_build_object('ok', false, 'fout', 'afgerond'); end if;
  select count(*) into v_open from public.posities ps
    where ps.offerte_id = i.offerte_id
      and not exists (select 1 from public.inmeting_regels r where r.inmeting_id = i.id and r.positie_id = ps.id and r.breedte_mm is not null and r.hoogte_mm is not null);
  if v_open > 0 then return jsonb_build_object('ok', false, 'fout', 'onvolledig', 'open', v_open); end if;
  update public.inmetingen set status = 'uitgevoerd', uitgevoerd_op = now(), gewijzigd = now() where id = i.id;
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.inmeting_afronden(uuid) from public, anon;
grant execute on function public.inmeting_afronden(uuid) to authenticated;
