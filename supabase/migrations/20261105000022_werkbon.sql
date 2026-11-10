-- Fase 2, stap 5: de werkbon van een montage. De monteur start de montage, werkt een checklist af per kozijn, legt foto's voor en na vast,
-- schrijft uren, meldt bijzonderheden en opleverpunten, en laat de klant bij de oplevering tekenen. Daarmee is de montage afgerond.
-- De monteur werkt uitsluitend via beveiligde functies (hij ziet geen prijzen en heeft geen toegang tot de tabellen); medewerkers lezen de tabellen.

create table public.werkbonnen (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants (id) on delete cascade,
  montage_id      uuid not null unique references public.montages (id) on delete cascade,
  status          text not null default 'open' check (status in ('open', 'opgeleverd')),
  bijzonderheden  text,
  kantoor_actie   boolean not null default false,        -- de monteur vraagt kantoor te reageren (bijvoorbeeld mogelijk meerwerk)
  opgeruimd       boolean not null default false,
  kantoor_gezien_op timestamptz,                          -- kantoor heeft de melding van de monteur gezien
  opgeleverd_op   timestamptz,
  opgeleverd_door uuid references auth.users (id) on delete set null,
  aangemaakt      timestamptz not null default now(),
  gewijzigd       timestamptz not null default now()
);
create index werkbonnen_tenant_idx on public.werkbonnen (tenant_id);

create table public.werkbon_regels (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants (id) on delete cascade,
  werkbon_id  uuid not null references public.werkbonnen (id) on delete cascade,
  positie_id  uuid not null references public.posities (id) on delete cascade,
  geplaatst   boolean not null default false,
  afgesteld   boolean not null default false,
  afgekit     boolean not null default false,
  afgewerkt   boolean not null default false,
  opmerking   text,
  bijgewerkt  timestamptz not null default now(),
  unique (werkbon_id, positie_id)
);
create index werkbon_regels_tenant_idx on public.werkbon_regels (tenant_id);

create table public.werkbon_uren (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants (id) on delete cascade,
  werkbon_id  uuid not null references public.werkbonnen (id) on delete cascade,
  monteur_id  uuid not null references public.monteurs (id) on delete restrict,
  datum       date not null,
  uren        numeric(4, 2) not null check (uren > 0 and uren <= 16),
  notitie     text,
  unique (werkbon_id, monteur_id, datum)
);
create index werkbon_uren_tenant_idx on public.werkbon_uren (tenant_id);
create index werkbon_uren_werkbon_idx on public.werkbon_uren (werkbon_id);

create table public.werkbon_fotos (
  id          uuid primary key,
  tenant_id   uuid not null references public.tenants (id) on delete cascade,
  werkbon_id  uuid not null references public.werkbonnen (id) on delete cascade,
  positie_id  uuid references public.posities (id) on delete cascade,   -- leeg bij een algemene foto
  soort       text not null check (soort in ('voor', 'na', 'punt', 'overig')),
  pad         text not null unique,
  door        uuid default auth.uid() references auth.users (id) on delete set null,
  aangemaakt  timestamptz not null default now()
);
create index werkbon_fotos_tenant_idx on public.werkbon_fotos (tenant_id);
create index werkbon_fotos_werkbon_idx on public.werkbon_fotos (werkbon_id);

create table public.opleverpunten (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants (id) on delete cascade,
  werkbon_id   uuid not null references public.werkbonnen (id) on delete cascade,
  positie_id   uuid references public.posities (id) on delete cascade,
  omschrijving text not null check (length(btrim(omschrijving)) > 0),
  status       text not null default 'open' check (status in ('open', 'opgelost')),
  gemeld_door  uuid default auth.uid() references auth.users (id) on delete set null,
  aangemaakt   timestamptz not null default now(),
  opgelost_op  timestamptz,
  opgelost_door uuid references auth.users (id) on delete set null
);
create index opleverpunten_tenant_idx on public.opleverpunten (tenant_id);
create index opleverpunten_werkbon_idx on public.opleverpunten (werkbon_id);
create index opleverpunten_positie_idx on public.opleverpunten (positie_id);
create index werkbon_regels_positie_idx on public.werkbon_regels (positie_id);
create index werkbon_fotos_positie_idx on public.werkbon_fotos (positie_id);
create index werkbon_uren_monteur_idx on public.werkbon_uren (monteur_id);

-- Het akkoord van de klant bij de oplevering: bewijs, niet meer te wijzigen.
create table public.werkbon_akkoorden (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references public.tenants (id) on delete cascade,
  werkbon_id        uuid not null unique references public.werkbonnen (id) on delete cascade,
  naam              text not null check (length(btrim(naam)) >= 3),
  handtekening      text not null,
  ip                text,
  user_agent        text,
  met_voorbehoud    boolean not null,
  aantal_open_punten integer not null default 0,
  op                timestamptz not null default now()
);
create index werkbon_akkoorden_tenant_idx on public.werkbon_akkoorden (tenant_id);

alter table public.werkbonnen enable row level security;
alter table public.werkbon_regels enable row level security;
alter table public.werkbon_uren enable row level security;
alter table public.werkbon_fotos enable row level security;
alter table public.opleverpunten enable row level security;
alter table public.werkbon_akkoorden enable row level security;

create policy werkbonnen_lezen on public.werkbonnen for select to authenticated
  using (public.heeft_rol(tenant_id, array['directie','kantoor','verkoop']::public.gebruikersrol[]));
create policy werkbon_regels_lezen on public.werkbon_regels for select to authenticated
  using (public.heeft_rol(tenant_id, array['directie','kantoor','verkoop']::public.gebruikersrol[]));
create policy werkbon_uren_lezen on public.werkbon_uren for select to authenticated
  using (public.heeft_rol(tenant_id, array['directie','kantoor','verkoop']::public.gebruikersrol[]));
create policy werkbon_fotos_lezen on public.werkbon_fotos for select to authenticated
  using (public.heeft_rol(tenant_id, array['directie','kantoor']::public.gebruikersrol[]));
create policy opleverpunten_lezen on public.opleverpunten for select to authenticated
  using (public.heeft_rol(tenant_id, array['directie','kantoor','verkoop']::public.gebruikersrol[]));
create policy werkbon_akkoorden_lezen on public.werkbon_akkoorden for select to authenticated
  using (public.heeft_rol(tenant_id, array['directie','kantoor']::public.gebruikersrol[]));
revoke insert, update, delete, truncate on public.werkbonnen, public.werkbon_regels, public.werkbon_uren, public.werkbon_fotos, public.opleverpunten, public.werkbon_akkoorden from authenticated, anon;

-- Een opgeleverde werkbon en het akkoord van de klant zijn niet meer te wijzigen of te verwijderen.
create function public.werkbon_vergrendelen() returns trigger
  language plpgsql set search_path = ''
  as $$
begin
  if tg_table_name = 'werkbon_akkoorden' then
    raise exception 'Het akkoord van de klant kan niet worden gewijzigd of verwijderd' using errcode = '55000';
  end if;
  -- Na de oplevering staat alles vast; alleen kantoor kan nog markeren dat de melding is gezien.
  -- (Verdwijnt het account van wie heeft opgeleverd, dan wordt opgeleverd_door leeg; dat is toegestaan.)
  if old.status = 'opgeleverd'
     and (tg_op = 'DELETE'
          or (to_jsonb(new) - 'kantoor_gezien_op' - 'gewijzigd' - 'opgeleverd_door') is distinct from (to_jsonb(old) - 'kantoor_gezien_op' - 'gewijzigd' - 'opgeleverd_door')
          or (new.opgeleverd_door is distinct from old.opgeleverd_door and new.opgeleverd_door is not null)) then
    raise exception 'Een opgeleverde werkbon kan niet meer worden gewijzigd of verwijderd' using errcode = '55000';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
create function public.werkbon_kinderen_vergrendelen() returns trigger
  language plpgsql security definer set search_path = ''
  as $$
declare
  v_status text;
begin
  select w.status into v_status from public.werkbonnen w where w.id = coalesce(new.werkbon_id, old.werkbon_id);
  -- Bestaat de werkbon niet meer (hij wordt zelf verwijderd), dan is er niets meer te beschermen.
  if v_status = 'opgeleverd' then
    -- Verdwijnt een account uit het systeem, dan worden de verwijzingen naar die gebruiker leeg (wie meldde, loste op of nam de foto). Dat is toegestaan.
    if tg_op = 'UPDATE'
       and (to_jsonb(new) - 'gemeld_door' - 'opgelost_door' - 'door') = (to_jsonb(old) - 'gemeld_door' - 'opgelost_door' - 'door')
       and ((to_jsonb(new) ->> 'gemeld_door') is null or (to_jsonb(new) ->> 'gemeld_door') = (to_jsonb(old) ->> 'gemeld_door'))
       and ((to_jsonb(new) ->> 'opgelost_door') is null or (to_jsonb(new) ->> 'opgelost_door') = (to_jsonb(old) ->> 'opgelost_door'))
       and ((to_jsonb(new) ->> 'door') is null or (to_jsonb(new) ->> 'door') = (to_jsonb(old) ->> 'door')) then
      return new;
    end if;
    -- Na de oplevering kan kantoor een opleverpunt nog als opgelost markeren, maar niet weer openzetten of aanpassen.
    if tg_table_name = 'opleverpunten' and tg_op = 'UPDATE' and old.status = 'open' and new.status = 'opgelost'
       and (to_jsonb(new) - 'status' - 'opgelost_op' - 'opgelost_door') = (to_jsonb(old) - 'status' - 'opgelost_op' - 'opgelost_door') then
      return new;
    end if;
    raise exception 'Een opgeleverde werkbon kan niet meer worden gewijzigd' using errcode = '55000';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
create trigger werkbon_regels_vergrendelen before insert or update or delete on public.werkbon_regels for each row execute function public.werkbon_kinderen_vergrendelen();
create trigger werkbon_uren_vergrendelen before insert or update or delete on public.werkbon_uren for each row execute function public.werkbon_kinderen_vergrendelen();
create trigger werkbon_fotos_vergrendelen before insert or update or delete on public.werkbon_fotos for each row execute function public.werkbon_kinderen_vergrendelen();
create trigger opleverpunten_vergrendelen before insert or update or delete on public.opleverpunten for each row execute function public.werkbon_kinderen_vergrendelen();

create trigger werkbonnen_vergrendelen before update or delete on public.werkbonnen
  for each row execute function public.werkbon_vergrendelen();
create trigger werkbon_akkoorden_vergrendelen before update or delete on public.werkbon_akkoorden
  for each row execute function public.werkbon_vergrendelen();

-- ---- Opslag voor de foto's: <montage_id>/<foto_id>.jpg ----

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('werkbon-fotos', 'werkbon-fotos', false, 8388608, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create function public.werkbon_pad_montage(p_pad text) returns uuid
  language sql immutable set search_path = ''
  as $$
  select case
    when p_pad ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$'
    then split_part(p_pad, '/', 1)::uuid
  end
$$;

-- Staat dit bestand al in de lijst met foto's van een werkbon? Zo ja, dan haal je het weg via de werkbon en niet rechtstreeks uit de opslag.
create function public.werkbon_foto_geregistreerd(p_pad text) returns boolean
  language sql stable security definer set search_path = ''
  as $$ select exists (select 1 from public.werkbon_fotos f where f.pad = p_pad) $$;
revoke all on function public.werkbon_foto_geregistreerd(text) from public, anon;
grant execute on function public.werkbon_foto_geregistreerd(text) to authenticated;

-- Mag de ingelogde gebruiker op deze montage schrijven (werkbon invullen, foto's toevoegen)? Alleen bij een lopende of komende montage zonder opgeleverde werkbon.
create function public.werkbon_schrijven(p_montage uuid) returns boolean
  language sql stable security definer set search_path = ''
  as $$
  select p_montage is not null
    and public.monteur_toegang(p_montage)
    and exists (select 1 from public.montages m where m.id = p_montage and m.status in ('definitief', 'bezig'))
    and not exists (select 1 from public.werkbonnen w where w.montage_id = p_montage and w.status = 'opgeleverd')
$$;
revoke all on function public.werkbon_schrijven(uuid) from public, anon;
grant execute on function public.werkbon_schrijven(uuid) to authenticated;

create policy werkbon_fotos_lezen_opslag on storage.objects for select to authenticated
  using (bucket_id = 'werkbon-fotos' and public.monteur_toegang(public.werkbon_pad_montage(name)));
create policy werkbon_fotos_uploaden on storage.objects for insert to authenticated
  with check (bucket_id = 'werkbon-fotos' and public.werkbon_schrijven(public.werkbon_pad_montage(name)));
create policy werkbon_fotos_verwijderen on storage.objects for delete to authenticated
  using (bucket_id = 'werkbon-fotos' and public.werkbon_schrijven(public.werkbon_pad_montage(name)) and not public.werkbon_foto_geregistreerd(name));

-- ---- Functies ----

-- De monteur begint aan de montage: de montage staat dan op bezig en de werkbon met een checklistregel per kozijn wordt aangemaakt.
create function public.werkbon_start(p_montage uuid) returns jsonb
  language plpgsql security definer set search_path = ''
  as $$
declare
  m public.montages;
  v_werkbon uuid;
begin
  if not public.monteur_toegang(p_montage) then return jsonb_build_object('ok', false, 'fout', 'geen_toegang'); end if;
  select * into m from public.montages where id = p_montage for update;
  if not found then return jsonb_build_object('ok', false, 'fout', 'geen_toegang'); end if;
  if m.status = 'voorlopig' then return jsonb_build_object('ok', false, 'fout', 'voorlopig'); end if;
  if m.status not in ('definitief', 'bezig') then return jsonb_build_object('ok', false, 'fout', 'niet_te_starten'); end if;
  if m.start_datum > (now() at time zone 'Europe/Amsterdam')::date then return jsonb_build_object('ok', false, 'fout', 'te_vroeg'); end if;
  if m.status = 'definitief' then update public.montages set status = 'bezig', gewijzigd = now() where id = m.id; end if;
  insert into public.werkbonnen (tenant_id, montage_id) values (m.tenant_id, m.id) on conflict (montage_id) do nothing;
  select id into v_werkbon from public.werkbonnen where montage_id = m.id;
  insert into public.werkbon_regels (tenant_id, werkbon_id, positie_id)
    select m.tenant_id, v_werkbon, ps.id from public.posities ps where ps.offerte_id = m.offerte_id and ps.tenant_id = m.tenant_id
    on conflict (werkbon_id, positie_id) do nothing;
  return jsonb_build_object('ok', true, 'werkbon', v_werkbon);
end $$;
revoke all on function public.werkbon_start(uuid) from public, anon;
grant execute on function public.werkbon_start(uuid) to authenticated;

-- Hulpfunctie: de open werkbon van een montage, vergrendeld voor wijziging. Null als de gebruiker niet mag schrijven of de werkbon niet bestaat.
create function public.werkbon_open(p_montage uuid) returns public.werkbonnen
  language plpgsql security definer set search_path = ''
  as $$
declare
  w public.werkbonnen;
begin
  if not public.werkbon_schrijven(p_montage) then return null; end if;
  -- Altijd eerst de montage vergrendelen en dan de werkbon, zodat gelijktijdige acties elkaar niet in de weg zitten en een montage die net is geannuleerd niet meer wordt aangepast.
  perform 1 from public.montages m where m.id = p_montage and m.status in ('definitief', 'bezig') for update;
  if not found then return null; end if;
  select * into w from public.werkbonnen where montage_id = p_montage and status = 'open' for update;
  return w;
end $$;
revoke all on function public.werkbon_open(uuid) from public, anon, authenticated;

-- De checklist van één kozijn en eventueel een opmerking.
create function public.werkbon_regel_bewaar(p_montage uuid, p_positie uuid, p_geplaatst boolean, p_afgesteld boolean, p_afgekit boolean, p_afgewerkt boolean, p_opmerking text) returns jsonb
  language plpgsql security definer set search_path = ''
  as $$
declare
  w public.werkbonnen;
begin
  w := public.werkbon_open(p_montage);
  if w.id is null then return jsonb_build_object('ok', false, 'fout', 'niet_beschikbaar'); end if;
  update public.werkbon_regels set geplaatst = coalesce(p_geplaatst, false), afgesteld = coalesce(p_afgesteld, false), afgekit = coalesce(p_afgekit, false),
         afgewerkt = coalesce(p_afgewerkt, false), opmerking = left(nullif(btrim(p_opmerking), ''), 1000), bijgewerkt = now()
    where werkbon_id = w.id and positie_id = p_positie;
  if not found then return jsonb_build_object('ok', false, 'fout', 'positie'); end if;
  update public.werkbonnen set gewijzigd = now() where id = w.id;
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.werkbon_regel_bewaar(uuid, uuid, boolean, boolean, boolean, boolean, text) from public, anon;
grant execute on function public.werkbon_regel_bewaar(uuid, uuid, boolean, boolean, boolean, boolean, text) to authenticated;

-- Bijzonderheden voor kantoor, of kantoor moet reageren, en of er is opgeruimd.
create function public.werkbon_algemeen_bewaar(p_montage uuid, p_bijzonderheden text, p_kantoor_actie boolean, p_opgeruimd boolean) returns jsonb
  language plpgsql security definer set search_path = ''
  as $$
declare
  w public.werkbonnen;
begin
  w := public.werkbon_open(p_montage);
  if w.id is null then return jsonb_build_object('ok', false, 'fout', 'niet_beschikbaar'); end if;
  update public.werkbonnen set bijzonderheden = left(nullif(btrim(p_bijzonderheden), ''), 4000), kantoor_actie = coalesce(p_kantoor_actie, false),
         opgeruimd = coalesce(p_opgeruimd, false), gewijzigd = now(),
         kantoor_gezien_op = case when bijzonderheden is distinct from left(nullif(btrim(p_bijzonderheden), ''), 4000) or (coalesce(p_kantoor_actie, false) and not kantoor_actie)
                                  then null else kantoor_gezien_op end
    where id = w.id;
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.werkbon_algemeen_bewaar(uuid, text, boolean, boolean) from public, anon;
grant execute on function public.werkbon_algemeen_bewaar(uuid, text, boolean, boolean) to authenticated;

-- Uren van een monteur op een dag (0 haalt de regel weg). Een monteur schrijft zijn eigen uren; kantoor kan er een monteur bij opgeven.
create function public.werkbon_uren_bewaar(p_montage uuid, p_datum date, p_uren numeric, p_notitie text, p_monteur uuid default null) returns jsonb
  language plpgsql security definer set search_path = ''
  as $$
declare
  w public.werkbonnen;
  m public.montages;
  v_monteur uuid;
  v_vandaag date := (now() at time zone 'Europe/Amsterdam')::date;
begin
  w := public.werkbon_open(p_montage);
  if w.id is null then return jsonb_build_object('ok', false, 'fout', 'niet_beschikbaar'); end if;
  select * into m from public.montages where id = p_montage;
  v_monteur := coalesce(public.mijn_monteur(), p_monteur);
  if v_monteur is null or not exists (
       select 1 from public.monteurs x join public.ploeg_leden pl on pl.monteur_id = x.id and pl.tenant_id = x.tenant_id
       where x.id = v_monteur and x.tenant_id = m.tenant_id and x.actief and pl.ploeg_id = m.ploeg_id
     ) then
    return jsonb_build_object('ok', false, 'fout', 'monteur');
  end if;
  if p_datum is null or p_datum < m.start_datum or p_datum > v_vandaag or p_uren is null or p_uren < 0 or p_uren > 16 or (p_uren * 4) <> round(p_uren * 4) then
    return jsonb_build_object('ok', false, 'fout', 'ongeldig');
  end if;
  if p_uren = 0 then
    delete from public.werkbon_uren where werkbon_id = w.id and monteur_id = v_monteur and datum = p_datum;
  else
    insert into public.werkbon_uren (tenant_id, werkbon_id, monteur_id, datum, uren, notitie)
      values (m.tenant_id, w.id, v_monteur, p_datum, p_uren, left(nullif(btrim(p_notitie), ''), 300))
    on conflict (werkbon_id, monteur_id, datum) do update set uren = excluded.uren, notitie = excluded.notitie;
  end if;
  update public.werkbonnen set gewijzigd = now() where id = w.id;
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.werkbon_uren_bewaar(uuid, date, numeric, text, uuid) from public, anon;
grant execute on function public.werkbon_uren_bewaar(uuid, date, numeric, text, uuid) to authenticated;

-- Legt een foto vast die al in de opslag staat (voor, na, bij een opleverpunt of algemeen).
create function public.werkbon_foto_toevoegen(p_montage uuid, p_positie uuid, p_soort text, p_id uuid) returns jsonb
  language plpgsql security definer set search_path = ''
  as $$
declare
  w public.werkbonnen;
  m public.montages;
  v_pad text;
begin
  w := public.werkbon_open(p_montage);
  if w.id is null then return jsonb_build_object('ok', false, 'fout', 'niet_beschikbaar'); end if;
  select * into m from public.montages where id = p_montage;
  if p_id is null or p_soort not in ('voor', 'na', 'punt', 'overig') or (p_soort in ('voor', 'na') and p_positie is null) then return jsonb_build_object('ok', false, 'fout', 'ongeldig'); end if;
  if p_positie is not null and not exists (select 1 from public.posities ps where ps.id = p_positie and ps.offerte_id = m.offerte_id and ps.tenant_id = m.tenant_id) then
    return jsonb_build_object('ok', false, 'fout', 'positie');
  end if;
  if (select count(*) from public.werkbon_fotos where werkbon_id = w.id) >= 120 then return jsonb_build_object('ok', false, 'fout', 'te_veel'); end if;
  v_pad := p_montage::text || '/' || p_id::text || '.jpg';
  if not exists (select 1 from storage.objects o where o.bucket_id = 'werkbon-fotos' and o.name = v_pad) then return jsonb_build_object('ok', false, 'fout', 'bestand'); end if;
  insert into public.werkbon_fotos (id, tenant_id, werkbon_id, positie_id, soort, pad) values (p_id, m.tenant_id, w.id, p_positie, p_soort, v_pad);
  return jsonb_build_object('ok', true);
exception when unique_violation then
  return jsonb_build_object('ok', false, 'fout', 'ongeldig');
end $$;
revoke all on function public.werkbon_foto_toevoegen(uuid, uuid, text, uuid) from public, anon;
grant execute on function public.werkbon_foto_toevoegen(uuid, uuid, text, uuid) to authenticated;

create function public.werkbon_foto_verwijderen(p_montage uuid, p_foto uuid) returns jsonb
  language plpgsql security definer set search_path = ''
  as $$
declare
  w public.werkbonnen;
  v_pad text;
begin
  w := public.werkbon_open(p_montage);
  if w.id is null then return jsonb_build_object('ok', false, 'fout', 'niet_beschikbaar'); end if;
  delete from public.werkbon_fotos where id = p_foto and werkbon_id = w.id returning pad into v_pad;
  if v_pad is null then return jsonb_build_object('ok', false, 'fout', 'onbekend'); end if;
  return jsonb_build_object('ok', true, 'pad', v_pad);
end $$;
revoke all on function public.werkbon_foto_verwijderen(uuid, uuid) from public, anon;
grant execute on function public.werkbon_foto_verwijderen(uuid, uuid) to authenticated;

-- Een opleverpunt melden (bijvoorbeeld een kras of een afstelling die nog moet gebeuren).
create function public.werkbon_punt_toevoegen(p_montage uuid, p_positie uuid, p_omschrijving text) returns jsonb
  language plpgsql security definer set search_path = ''
  as $$
declare
  w public.werkbonnen;
  m public.montages;
  v_id uuid;
begin
  w := public.werkbon_open(p_montage);
  if w.id is null then return jsonb_build_object('ok', false, 'fout', 'niet_beschikbaar'); end if;
  select * into m from public.montages where id = p_montage;
  if length(btrim(coalesce(p_omschrijving, ''))) = 0 then return jsonb_build_object('ok', false, 'fout', 'omschrijving'); end if;
  if p_positie is not null and not exists (select 1 from public.posities ps where ps.id = p_positie and ps.offerte_id = m.offerte_id and ps.tenant_id = m.tenant_id) then
    return jsonb_build_object('ok', false, 'fout', 'positie');
  end if;
  if (select count(*) from public.opleverpunten where werkbon_id = w.id) >= 60 then return jsonb_build_object('ok', false, 'fout', 'te_veel'); end if;
  insert into public.opleverpunten (tenant_id, werkbon_id, positie_id, omschrijving) values (m.tenant_id, w.id, p_positie, left(btrim(p_omschrijving), 500)) returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id);
end $$;
revoke all on function public.werkbon_punt_toevoegen(uuid, uuid, text) from public, anon;
grant execute on function public.werkbon_punt_toevoegen(uuid, uuid, text) to authenticated;

-- Een opleverpunt als opgelost markeren (of weer openzetten). Tijdens de montage mag de ploeg dat; na de oplevering alleen directie en kantoor.
create function public.werkbon_punt_oplossen(p_montage uuid, p_punt uuid, p_opgelost boolean) returns jsonb
  language plpgsql security definer set search_path = ''
  as $$
declare
  w public.werkbonnen;
  m public.montages;
begin
  select * into m from public.montages where id = p_montage;
  if not found or not public.monteur_toegang(p_montage) then return jsonb_build_object('ok', false, 'fout', 'geen_toegang'); end if;
  select * into w from public.werkbonnen where montage_id = p_montage for update;
  if not found then return jsonb_build_object('ok', false, 'fout', 'niet_beschikbaar'); end if;
  if w.status = 'opgeleverd' and (not p_opgelost or not public.heeft_rol(m.tenant_id, array['directie','kantoor']::public.gebruikersrol[])) then
    return jsonb_build_object('ok', false, 'fout', 'opgeleverd');
  end if;
  update public.opleverpunten set status = case when p_opgelost then 'opgelost' else 'open' end,
         opgelost_op = case when p_opgelost then now() end, opgelost_door = case when p_opgelost then auth.uid() end
    where id = p_punt and werkbon_id = w.id and status = case when p_opgelost then 'open' else 'opgelost' end;
  if not found then return jsonb_build_object('ok', false, 'fout', 'onbekend'); end if;
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.werkbon_punt_oplossen(uuid, uuid, boolean) from public, anon;
grant execute on function public.werkbon_punt_oplossen(uuid, uuid, boolean) to authenticated;

-- Levert de montage op: de klant tekent. Elk kozijn moet geplaatst zijn; wat nog niet is afgesteld, afgekit of afgewerkt moet als opleverpunt
-- zijn gemeld. Is er nog een open opleverpunt, dan is de oplevering met voorbehoud. De montage is daarna afgerond en het project staat in de fase Oplevering.
create function public.werkbon_opleveren(p_montage uuid, p_naam text, p_handtekening text, p_ip text, p_user_agent text) returns jsonb
  language plpgsql security definer set search_path = ''
  as $$
declare
  w public.werkbonnen;
  m public.montages;
  v_onvolledig integer;
  v_open integer;
begin
  -- Alleen een monteur (of de directie) levert op: de handtekening van de klant is het bewijs, kantoor tekent niet namens de klant.
  if public.mijn_monteur() is null and not exists (select 1 from public.montages mm where mm.id = p_montage and public.heeft_rol(mm.tenant_id, array['directie']::public.gebruikersrol[])) then
    return jsonb_build_object('ok', false, 'fout', 'alleen_monteur');
  end if;
  w := public.werkbon_open(p_montage);
  if w.id is null then return jsonb_build_object('ok', false, 'fout', 'niet_beschikbaar'); end if;
  select * into m from public.montages where id = p_montage;
  if m.status <> 'bezig' then return jsonb_build_object('ok', false, 'fout', 'niet_bezig'); end if;
  if length(btrim(coalesce(p_naam, ''))) < 3 or length(p_naam) > 120 then return jsonb_build_object('ok', false, 'fout', 'naam'); end if;
  if p_handtekening is null or p_handtekening !~ '^data:image/png;base64,[A-Za-z0-9+/]+={0,2}$' or length(p_handtekening) < 200 or length(p_handtekening) > 400000 then
    return jsonb_build_object('ok', false, 'fout', 'handtekening');
  end if;
  -- Elk kozijn van de offerte moet een checklistregel hebben en er moet minstens één kozijn zijn.
  if not exists (select 1 from public.posities ps where ps.offerte_id = m.offerte_id and ps.tenant_id = m.tenant_id)
     or exists (select 1 from public.posities ps where ps.offerte_id = m.offerte_id and ps.tenant_id = m.tenant_id
                and not exists (select 1 from public.werkbon_regels r where r.werkbon_id = w.id and r.positie_id = ps.id)) then
    return jsonb_build_object('ok', false, 'fout', 'checklist_onvolledig', 'aantal', (select count(*) from public.posities ps where ps.offerte_id = m.offerte_id and ps.tenant_id = m.tenant_id and not exists (select 1 from public.werkbon_regels r where r.werkbon_id = w.id and r.positie_id = ps.id)));
  end if;
  select count(*) into v_onvolledig from public.werkbon_regels r
    where r.werkbon_id = w.id
      and (not r.geplaatst
           or ((not r.afgesteld or not r.afgekit or not r.afgewerkt)
               and not exists (select 1 from public.opleverpunten p where p.werkbon_id = w.id and p.positie_id = r.positie_id and p.status = 'open')));
  if v_onvolledig > 0 then return jsonb_build_object('ok', false, 'fout', 'checklist_onvolledig', 'aantal', v_onvolledig); end if;
  select count(*) into v_open from public.opleverpunten p where p.werkbon_id = w.id and p.status = 'open';
  insert into public.werkbon_akkoorden (tenant_id, werkbon_id, naam, handtekening, ip, user_agent, met_voorbehoud, aantal_open_punten)
    values (m.tenant_id, w.id, btrim(p_naam), p_handtekening, left(p_ip, 80), left(p_user_agent, 300), v_open > 0, v_open);
  update public.werkbonnen set status = 'opgeleverd', opgeleverd_op = now(), opgeleverd_door = auth.uid(), gewijzigd = now() where id = w.id;
  update public.montages set status = 'afgerond', afgerond_op = now(), gewijzigd = now() where id = m.id;
  update public.projecten set fase = 'oplevering', gewijzigd = now() where id = m.project_id and fase = 'montage';
  return jsonb_build_object('ok', true, 'met_voorbehoud', v_open > 0, 'open_punten', v_open);
end $$;
revoke all on function public.werkbon_opleveren(uuid, text, text, text, text) from public, anon;
grant execute on function public.werkbon_opleveren(uuid, text, text, text, text) to authenticated;

-- Kantoor markeert de melding van de monteur ("kantoor moet reageren") als gezien.
create function public.werkbon_gezien(p_montage uuid) returns jsonb
  language plpgsql security definer set search_path = ''
  as $$
declare
  m public.montages;
begin
  select * into m from public.montages where id = p_montage;
  if not found or not public.heeft_rol(m.tenant_id, array['directie','kantoor']::public.gebruikersrol[]) then
    return jsonb_build_object('ok', false, 'fout', 'geen_toegang');
  end if;
  update public.werkbonnen set kantoor_gezien_op = now() where montage_id = p_montage and kantoor_actie and kantoor_gezien_op is null;
  if not found then return jsonb_build_object('ok', false, 'fout', 'niets_te_doen'); end if;
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.werkbon_gezien(uuid) from public, anon;
grant execute on function public.werkbon_gezien(uuid) to authenticated;

-- Alles van de werkbon voor het scherm van de monteur en van kantoor. Geen prijzen en niet het handtekeningbeeld.
create function public.werkbon_laad(p_montage uuid) returns jsonb
  language plpgsql stable security definer set search_path = ''
  as $$
declare
  w public.werkbonnen;
begin
  if not public.monteur_toegang(p_montage) then return null; end if;
  select * into w from public.werkbonnen where montage_id = p_montage;
  if not found then return null; end if;
  return jsonb_build_object(
    'id', w.id, 'status', w.status, 'bijzonderheden', w.bijzonderheden, 'kantoor_actie', w.kantoor_actie, 'opgeruimd', w.opgeruimd, 'kantoor_gezien_op', w.kantoor_gezien_op, 'opgeleverd_op', w.opgeleverd_op,
    'regels', (select coalesce(jsonb_agg(jsonb_build_object('positie_id', r.positie_id, 'geplaatst', r.geplaatst, 'afgesteld', r.afgesteld, 'afgekit', r.afgekit, 'afgewerkt', r.afgewerkt, 'opmerking', r.opmerking)), '[]'::jsonb)
               from public.werkbon_regels r where r.werkbon_id = w.id),
    'uren', (select coalesce(jsonb_agg(jsonb_build_object('monteur', m.naam, 'monteur_id', u.monteur_id, 'datum', u.datum, 'uren', u.uren, 'notitie', u.notitie) order by u.datum, m.naam), '[]'::jsonb)
             from public.werkbon_uren u join public.monteurs m on m.id = u.monteur_id and m.tenant_id = u.tenant_id where u.werkbon_id = w.id),
    'fotos', (select coalesce(jsonb_agg(jsonb_build_object('id', f.id, 'positie_id', f.positie_id, 'soort', f.soort, 'pad', f.pad) order by f.aangemaakt), '[]'::jsonb)
              from public.werkbon_fotos f where f.werkbon_id = w.id),
    'punten', (select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'positie_id', p.positie_id, 'omschrijving', p.omschrijving, 'status', p.status, 'opgelost_op', p.opgelost_op) order by p.aangemaakt), '[]'::jsonb)
               from public.opleverpunten p where p.werkbon_id = w.id),
    'akkoord', (select jsonb_build_object('naam', a.naam, 'op', a.op, 'met_voorbehoud', a.met_voorbehoud, 'aantal_open_punten', a.aantal_open_punten)
                from public.werkbon_akkoorden a where a.werkbon_id = w.id)
  );
end $$;
revoke all on function public.werkbon_laad(uuid) from public, anon;
grant execute on function public.werkbon_laad(uuid) to authenticated;

-- Een montage rond je af door op te leveren: de monteur laat de klant tekenen op de werkbon. Kantoor kan hem niet meer zelf afronden,
-- ook niet als er nog geen werkbon is (dan start een monteur of de directie de werkbon via de montageafspraak).
create or replace function public.rond_montage_af(p_montage uuid) returns jsonb
  language plpgsql security definer set search_path = ''
  as $$
declare
  m public.montages;
begin
  select * into m from public.montages where id = p_montage;
  if not found or not public.heeft_rol(m.tenant_id, array['directie','kantoor']::public.gebruikersrol[]) then
    return jsonb_build_object('ok', false, 'fout', 'geen_toegang');
  end if;
  return jsonb_build_object('ok', false, 'fout', 'via_werkbon');
end $$;
revoke all on function public.rond_montage_af(uuid) from public, anon;
grant execute on function public.rond_montage_af(uuid) to authenticated;
