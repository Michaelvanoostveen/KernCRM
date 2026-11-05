-- Fase 1, stap 10: offerte versturen (vergrendelen), openbare link voor de klant en akkoord met handtekening.

alter table public.offertes
  add column publiek_token  text unique,
  add column verstuurd_op   timestamptz,
  add column verstuurd_door uuid references auth.users (id) on delete set null,
  add column geldig_tot     date;

-- Logboek van wat er met een offerte gebeurt.
create table public.offerte_gebeurtenissen (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants (id) on delete cascade,
  offerte_id  uuid not null references public.offertes (id) on delete cascade,
  soort       text not null check (soort in ('verstuurd', 'geopend', 'akkoord', 'ingetrokken')),
  op          timestamptz not null default now(),
  ip          text,
  user_agent  text,
  door        uuid default auth.uid() references auth.users (id) on delete set null
);
create index offerte_gebeurtenissen_idx on public.offerte_gebeurtenissen (offerte_id, op desc);
alter table public.offerte_gebeurtenissen enable row level security;
create policy gebeurtenissen_lezen on public.offerte_gebeurtenissen for select to authenticated
  using (public.heeft_rol(tenant_id, array['directie','verkoop','kantoor']::public.gebruikersrol[]));
create policy gebeurtenissen_schrijven on public.offerte_gebeurtenissen for insert to authenticated
  with check (
    soort in ('verstuurd', 'ingetrokken')
    and public.heeft_rol(tenant_id, array['directie','verkoop','kantoor']::public.gebruikersrol[])
    and exists (select 1 from public.offertes o where o.id = offerte_id and o.tenant_id = offerte_gebeurtenissen.tenant_id)
  );

-- Bewijs van akkoord: wie, wanneer, vanaf welk IP-adres, met welke handtekening en wat er precies is ondertekend.
create table public.offerte_akkoorden (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants (id) on delete cascade,
  offerte_id    uuid not null unique references public.offertes (id) on delete cascade,
  naam          text not null,
  handtekening  text not null,
  ip            text,
  user_agent    text,
  op            timestamptz not null default now(),
  totaal        numeric(10, 2) not null,
  snapshot      jsonb not null
);
alter table public.offerte_akkoorden enable row level security;
create policy akkoorden_lezen on public.offerte_akkoorden for select to authenticated
  using (public.heeft_rol(tenant_id, array['directie','verkoop','kantoor']::public.gebruikersrol[]));

-- Een verstuurde offerte is vergrendeld: regels, posities en de eigen totaalprijs zijn niet meer te wijzigen.
create function public.offerte_vergrendeling() returns trigger
  language plpgsql security definer set search_path = ''
  as $$
declare
  v_status public.offertestatus;
begin
  select o.status into v_status from public.offertes o where o.id = coalesce(new.offerte_id, old.offerte_id);
  -- Bij het verwijderen van een heel project bestaat de offerte al niet meer: dan is er niets te vergrendelen.
  if v_status is not null and v_status <> 'concept' then
    raise exception 'Deze offerte is verstuurd en vergrendeld' using errcode = '55006';
  end if;
  return coalesce(new, old);
end $$;
create trigger offerte_regels_vergrendeling before insert or update or delete on public.offerte_regels
  for each row execute function public.offerte_vergrendeling();
create trigger posities_vergrendeling before insert or update or delete on public.posities
  for each row execute function public.offerte_vergrendeling();

create function public.offertes_vergrendeling() returns trigger
  language plpgsql security definer set search_path = ''
  as $$
begin
  if old.status <> 'concept' and new.totaal_override is distinct from old.totaal_override then
    raise exception 'Deze offerte is verstuurd en vergrendeld' using errcode = '55006';
  end if;
  return new;
end $$;
create trigger offertes_vergrendeling before update on public.offertes
  for each row execute function public.offertes_vergrendeling();

-- ── Openbare functies voor de klant: werken alleen met de geheime sleutel uit de link ──

-- Alles wat de klant mag zien. Nooit: oorspronkelijke prijzen, aanpassingen of redenen; alleen de eindprijzen.
create function public.offerte_publiek(p_token text) returns jsonb
  language plpgsql stable security definer set search_path = ''
  as $$
declare
  o public.offertes;
  r jsonb;
begin
  if p_token is null or length(p_token) < 32 then return null; end if;
  select * into o from public.offertes where publiek_token = p_token and status in ('verstuurd', 'akkoord');
  if not found then return null; end if;

  select jsonb_build_object(
    'bedrijf', t.naam,
    'nummer', p.nummer,
    'versie', o.versie,
    'status', o.status,
    'geldig_tot', o.geldig_tot,
    'verstuurd_op', o.verstuurd_op,
    'project_naam', p.naam,
    'klant_naam', k.naam,
    'aanhef', k.aanhef,
    'achternaam', k.achternaam,
    'adres', (select jsonb_build_object('straat', a.straat, 'huisnummer', a.huisnummer, 'toevoeging', a.toevoeging, 'postcode', a.postcode, 'plaats', a.plaats)
              from public.adressen a where a.klant_id = k.id and a.soort = 'project' limit 1),
    'eigen_totaal', o.totaal_override,
    'akkoord', (select jsonb_build_object('naam', ak.naam, 'op', ak.op) from public.offerte_akkoorden ak where ak.offerte_id = o.id),
    'regels', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'soort', rg.soort,
        'titel', rg.titel,
        'tekst', rg.tekst,
        'aantal', case when rg.soort = 'positie' then ps.aantal else rg.aantal end,
        'prijs', case when rg.soort = 'positie' then coalesce(rg.prijs_override, ps.prijs)
                      when rg.soort = 'artikel' then coalesce(rg.prijs_override, rg.prijs)
                      else 0 end,
        'modus', rg.korting_modus,
        'waarde', rg.korting_waarde,
        'eenheid', ar.eenheid,
        'positie', case when ps.id is not null then jsonb_build_object('nummer', ps.nummer, 'ruimte', ps.ruimte, 'config', ps.config) end
      ) order by rg.volgorde), '[]'::jsonb)
      from public.offerte_regels rg
      left join public.posities ps on ps.id = rg.positie_id
      left join public.artikelen ar on ar.id = rg.artikel_id
      where rg.offerte_id = o.id
    )
  ) into r
  from public.tenants t, public.projecten p, public.klanten k
  where t.id = o.tenant_id and p.id = o.project_id and k.id = p.klant_id;
  return r;
end $$;

-- Legt vast dat de klant de offerte opent.
create function public.offerte_geopend(p_token text, p_ip text, p_user_agent text) returns void
  language plpgsql security definer set search_path = ''
  as $$
declare
  o public.offertes;
begin
  if p_token is null or length(p_token) < 32 then return; end if;
  select * into o from public.offertes where publiek_token = p_token and status in ('verstuurd', 'akkoord');
  if not found then return; end if;
  insert into public.offerte_gebeurtenissen (tenant_id, offerte_id, soort, ip, user_agent, door)
    values (o.tenant_id, o.id, 'geopend', left(p_ip, 80), left(p_user_agent, 300), null);
end $$;

-- Akkoord van de klant met een handtekening. Kan één keer per offerte.
create function public.offerte_akkoord(p_token text, p_naam text, p_handtekening text, p_ip text, p_user_agent text, p_totaal numeric) returns jsonb
  language plpgsql security definer set search_path = ''
  as $$
declare
  o public.offertes;
  v_snapshot jsonb;
begin
  if p_token is null or length(p_token) < 32 then return jsonb_build_object('ok', false, 'fout', 'onbekend'); end if;
  select * into o from public.offertes where publiek_token = p_token and status = 'verstuurd' for update;
  if not found then return jsonb_build_object('ok', false, 'fout', 'onbekend'); end if;
  if o.geldig_tot is not null and o.geldig_tot < current_date then return jsonb_build_object('ok', false, 'fout', 'verlopen'); end if;
  if p_naam is null or length(btrim(p_naam)) < 3 or length(p_naam) > 120 then return jsonb_build_object('ok', false, 'fout', 'naam'); end if;
  if p_handtekening is null or p_handtekening not like 'data:image/png;base64,%' or length(p_handtekening) > 400000 or length(p_handtekening) < 200 then
    return jsonb_build_object('ok', false, 'fout', 'handtekening');
  end if;
  if p_totaal is null or p_totaal < 0 then return jsonb_build_object('ok', false, 'fout', 'totaal'); end if;

  v_snapshot := public.offerte_publiek(p_token);
  insert into public.offerte_akkoorden (tenant_id, offerte_id, naam, handtekening, ip, user_agent, totaal, snapshot)
    values (o.tenant_id, o.id, btrim(p_naam), p_handtekening, left(p_ip, 80), left(p_user_agent, 300), p_totaal, v_snapshot);
  update public.offertes set status = 'akkoord' where id = o.id;
  update public.projecten set fase = 'akkoord', gewijzigd = now() where id = o.project_id and fase in ('lead', 'offerte');
  insert into public.offerte_gebeurtenissen (tenant_id, offerte_id, soort, ip, user_agent, door)
    values (o.tenant_id, o.id, 'akkoord', left(p_ip, 80), left(p_user_agent, 300), null);
  return jsonb_build_object('ok', true);
end $$;

revoke all on function public.offerte_publiek(text) from public;
revoke all on function public.offerte_geopend(text, text, text) from public;
revoke all on function public.offerte_akkoord(text, text, text, text, text, numeric) from public;
grant execute on function public.offerte_publiek(text) to anon, authenticated;
grant execute on function public.offerte_geopend(text, text, text) to anon, authenticated;
grant execute on function public.offerte_akkoord(text, text, text, text, text, numeric) to anon, authenticated;
