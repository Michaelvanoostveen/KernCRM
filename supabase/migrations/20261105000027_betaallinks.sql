-- Fase 3: betaallinks (online betalen, bijvoorbeeld iDEAL via Mollie). Voorbereiding: per bedrijf staat vast welke betaaldienst actief is (zonder geheimen;
-- de API-sleutel komt later versleuteld per bedrijf), en per factuur kan er één actieve betaallink zijn. Tot de verbinding met de betaaldienst er is,
-- maakt de medewerker de link zelf in het dashboard van de betaaldienst en legt hem hier vast; hij komt dan in de mailtekst en op de PDF.
-- Dat een klant online heeft betaald, registreer je zoals altijd als betaling op de factuur; de link volgt de status van de factuur.

create table public.betaal_koppelingen (
  tenant_id    uuid primary key references public.tenants (id) on delete cascade,
  provider     text not null default 'geen' check (provider in ('geen', 'mollie')),
  actief       boolean not null default false,
  instellingen jsonb not null default '{}'::jsonb check (jsonb_typeof(instellingen) = 'object'),
  gewijzigd    timestamptz not null default now(),
  gewijzigd_door uuid default auth.uid() references auth.users (id) on delete set null,
  check (not actief or provider <> 'geen')
);

create table public.factuur_betaallinks (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants (id) on delete cascade,
  factuur_id  uuid not null references public.facturen (id) on delete restrict,
  url         text not null check (url ~* '^https://[a-z0-9]([a-z0-9.-]*[a-z0-9])?(:[0-9]{1,5})?(/[A-Za-z0-9._~!$&()*+,;=:@%/?#-]*)?$' and length(url) <= 500),
  bedrag      numeric(10, 2) not null check (bedrag > 0),
  bron        text not null default 'handmatig' check (bron in ('handmatig', 'mollie')),
  extern_id   text check (extern_id is null or length(extern_id) <= 100),
  geldig_tot  date,
  status      text not null default 'open' check (status in ('open', 'betaald', 'verlopen', 'ingetrokken')),
  door        uuid default auth.uid() references auth.users (id) on delete set null,
  aangemaakt  timestamptz not null default now(),
  gewijzigd   timestamptz not null default now()
);
create unique index factuur_betaallinks_een_open on public.factuur_betaallinks (factuur_id) where status = 'open';
create index factuur_betaallinks_tenant_idx on public.factuur_betaallinks (tenant_id);
create index factuur_betaallinks_factuur_idx on public.factuur_betaallinks (factuur_id);

alter table public.betaal_koppelingen enable row level security;
alter table public.factuur_betaallinks enable row level security;
create policy betaal_koppelingen_lezen on public.betaal_koppelingen for select to authenticated
  using (public.heeft_rol(tenant_id, array['directie','kantoor']::public.gebruikersrol[]));
create policy factuur_betaallinks_lezen on public.factuur_betaallinks for select to authenticated
  using (public.heeft_rol(tenant_id, array['directie','kantoor','verkoop']::public.gebruikersrol[]));
revoke insert, update, delete, truncate on public.betaal_koppelingen, public.factuur_betaallinks from authenticated, anon;

-- Bewaart de betaaldienst van het bedrijf (alleen de directie). Alleen bekende sleutels met korte tekstwaarden.
create function public.betaal_koppeling_bewaar(p_tenant uuid, p_provider text, p_actief boolean, p_instellingen jsonb) returns jsonb
  language plpgsql security definer set search_path = ''
  as $$
declare
  v_toegestaan text[] := array['profiel'];
  v_sleutel text;
begin
  if p_tenant is null or not public.heeft_rol(p_tenant, array['directie']::public.gebruikersrol[]) then
    return jsonb_build_object('ok', false, 'fout', 'geen_toegang');
  end if;
  if p_provider is null or p_provider not in ('geen', 'mollie') or p_instellingen is null or jsonb_typeof(p_instellingen) <> 'object' then
    return jsonb_build_object('ok', false, 'fout', 'ongeldig');
  end if;
  for v_sleutel in select jsonb_object_keys(p_instellingen) loop
    if not v_sleutel = any (v_toegestaan) or jsonb_typeof(p_instellingen -> v_sleutel) <> 'string' or length(p_instellingen ->> v_sleutel) > 40 then
      return jsonb_build_object('ok', false, 'fout', 'ongeldig');
    end if;
  end loop;
  if coalesce(p_actief, false) and p_provider = 'geen' then return jsonb_build_object('ok', false, 'fout', 'geen_provider'); end if;
  insert into public.betaal_koppelingen (tenant_id, provider, actief, instellingen)
    values (p_tenant, p_provider, coalesce(p_actief, false), p_instellingen)
    on conflict (tenant_id) do update set provider = excluded.provider, actief = excluded.actief, instellingen = excluded.instellingen, gewijzigd = now(), gewijzigd_door = auth.uid();
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.betaal_koppeling_bewaar(uuid, text, boolean, jsonb) from public, anon;
grant execute on function public.betaal_koppeling_bewaar(uuid, text, boolean, jsonb) to authenticated;

-- Legt een betaallink vast bij een open, verzonden of nog niet verzonden factuur. Een eerdere open link wordt ingetrokken: er is er maar één tegelijk.
-- Het bedrag is wat er op dat moment nog openstaat; de link is alleen een hulpmiddel en verandert niets aan de factuur.
create function public.betaallink_toevoegen(p_factuur uuid, p_url text, p_geldig_tot date) returns jsonb
  language plpgsql security definer set search_path = ''
  as $$
declare
  f public.facturen;
  v_betaald numeric(10, 2);
  v_open numeric(10, 2);
  v_url text := btrim(coalesce(p_url, ''));
begin
  select * into f from public.facturen where id = p_factuur for update;
  if not found or not public.heeft_rol(f.tenant_id, array['directie','kantoor']::public.gebruikersrol[]) then
    return jsonb_build_object('ok', false, 'fout', 'geen_toegang');
  end if;
  if f.status <> 'open' then return jsonb_build_object('ok', false, 'fout', 'niet_open'); end if;
  if v_url !~* '^https://[a-z0-9]([a-z0-9.-]*[a-z0-9])?(:[0-9]{1,5})?(/[A-Za-z0-9._~!$&()*+,;=:@%/?#-]*)?$' or length(v_url) > 500 or (p_geldig_tot is not null and p_geldig_tot < (now() at time zone 'Europe/Amsterdam')::date) then
    return jsonb_build_object('ok', false, 'fout', 'ongeldig');
  end if;
  select coalesce(sum(bedrag), 0) into v_betaald from public.factuur_betalingen where factuur_id = f.id;
  v_open := f.totaal_incl - f.gecrediteerd - v_betaald;
  if v_open <= 0 then return jsonb_build_object('ok', false, 'fout', 'niet_open'); end if;
  update public.factuur_betaallinks set status = 'ingetrokken', gewijzigd = now() where factuur_id = f.id and status = 'open';
  insert into public.factuur_betaallinks (tenant_id, factuur_id, url, bedrag, geldig_tot) values (f.tenant_id, f.id, v_url, v_open, p_geldig_tot);
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.betaallink_toevoegen(uuid, text, date) from public, anon;
grant execute on function public.betaallink_toevoegen(uuid, text, date) to authenticated;

create function public.betaallink_intrekken(p_link uuid) returns jsonb
  language plpgsql security definer set search_path = ''
  as $$
declare
  l public.factuur_betaallinks;
begin
  select * into l from public.factuur_betaallinks where id = p_link for update;
  if not found or not public.heeft_rol(l.tenant_id, array['directie','kantoor']::public.gebruikersrol[]) then
    return jsonb_build_object('ok', false, 'fout', 'geen_toegang');
  end if;
  if l.status <> 'open' then return jsonb_build_object('ok', false, 'fout', 'niet_open'); end if;
  update public.factuur_betaallinks set status = 'ingetrokken', gewijzigd = now() where id = l.id;
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.betaallink_intrekken(uuid) from public, anon;
grant execute on function public.betaallink_intrekken(uuid) to authenticated;

-- De link volgt de factuur: is de factuur betaald dan is de link betaald; wordt hij geannuleerd of gecrediteerd, dan verloopt de link.
-- Verandert er iets aan het bedrag dat openstaat (deelbetaling of creditnota), dan klopt het bedrag op de link niet meer en trekken we hem in.
-- Een betaling die de factuur helemaal betaalt, zet de link op betaald; een deelbetaling trekt hem in.
create function public.betaallink_volgt_factuur() returns trigger
  language plpgsql security definer set search_path = ''
  as $$
begin
  if new.status <> old.status then
    update public.factuur_betaallinks set status = case when new.status = 'betaald' then 'betaald' else 'verlopen' end, gewijzigd = now()
      where factuur_id = new.id and status = 'open';
  elsif new.gecrediteerd <> old.gecrediteerd then
    update public.factuur_betaallinks set status = 'ingetrokken', gewijzigd = now() where factuur_id = new.id and status = 'open';
  end if;
  return new;
end $$;
create trigger facturen_betaallinks after update of status, gecrediteerd on public.facturen
  for each row execute function public.betaallink_volgt_factuur();

create function public.betaallink_na_betaling() returns trigger
  language plpgsql security definer set search_path = ''
  as $$
declare
  f public.facturen;
begin
  select * into f from public.facturen where id = new.factuur_id;
  update public.factuur_betaallinks set
    status = case when (select coalesce(sum(b.bedrag), 0) from public.factuur_betalingen b where b.factuur_id = f.id) + f.gecrediteerd >= f.totaal_incl then 'betaald' else 'ingetrokken' end,
    gewijzigd = now()
    where factuur_id = new.factuur_id and status = 'open';
  return new;
end $$;
create trigger factuur_betalingen_betaallinks after insert on public.factuur_betalingen
  for each row execute function public.betaallink_na_betaling();
