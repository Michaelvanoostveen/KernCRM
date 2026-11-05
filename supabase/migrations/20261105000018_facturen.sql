-- Fase 3, stap 1: termijnfacturen en betalingen.
-- Een factuur is een boekhoudkundig stuk: de bedragen en de tekst zijn na het aanmaken niet meer te wijzigen en een factuur
-- verdwijnt niet met het project. Fout? Dan annuleren we de factuur (het nummer blijft bestaan) en maken we een nieuwe.

create table public.facturen (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants (id) on delete cascade,
  project_id    uuid not null references public.projecten (id) on delete restrict,
  offerte_id    uuid not null references public.offertes (id) on delete restrict,
  nummer        text not null,
  termijn       integer not null check (termijn between 1 and 10),
  termijn_pct   numeric(5, 2) not null check (termijn_pct >= 0 and termijn_pct <= 100),
  omschrijving  text not null check (length(btrim(omschrijving)) > 0),
  toelichting   text,
  factuurdatum  date not null,
  vervaldatum   date not null,
  bedrag_excl   numeric(10, 2) not null,
  btw_hoog      numeric(10, 2) not null,
  btw_laag      numeric(10, 2) not null,
  totaal_incl   numeric(10, 2) not null check (totaal_incl >= 0),
  meerwerk      numeric(10, 2) not null default 0,       -- het deel van het totaal dat meer- of minderwerk is (alleen eindfactuur)
  status        text not null default 'open' check (status in ('open', 'betaald', 'geannuleerd')),
  annulering_reden text,
  aangemaakt_door uuid default auth.uid() references auth.users (id) on delete set null,
  aangemaakt    timestamptz not null default now(),
  unique (tenant_id, nummer),
  check (bedrag_excl + btw_hoog + btw_laag = totaal_incl),
  check (vervaldatum >= factuurdatum)
);
create index facturen_tenant_idx on public.facturen (tenant_id, factuurdatum desc);
create index facturen_project_idx on public.facturen (project_id);
-- Per project maar één lopende factuur per termijn.
create unique index facturen_een_per_termijn on public.facturen (project_id, termijn) where status <> 'geannuleerd';

create table public.factuur_betalingen (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants (id) on delete cascade,
  factuur_id  uuid not null references public.facturen (id) on delete restrict,
  bedrag      numeric(10, 2) not null check (bedrag > 0),
  betaald_op  date not null,
  notitie     text,
  door        uuid default auth.uid() references auth.users (id) on delete set null,
  aangemaakt  timestamptz not null default now()
);
create index factuur_betalingen_factuur_idx on public.factuur_betalingen (factuur_id);
create index factuur_betalingen_tenant_idx on public.factuur_betalingen (tenant_id);

alter table public.facturen enable row level security;
alter table public.factuur_betalingen enable row level security;

-- Lezen: directie, kantoor en verkoop. Schrijven uitsluitend via de functies hieronder (alleen directie en kantoor).
create policy facturen_lezen on public.facturen for select to authenticated
  using (public.heeft_rol(tenant_id, array['directie','kantoor','verkoop']::public.gebruikersrol[]));
create policy factuur_betalingen_lezen on public.factuur_betalingen for select to authenticated
  using (public.heeft_rol(tenant_id, array['directie','kantoor','verkoop']::public.gebruikersrol[]));

-- Na het aanmaken blijven bedragen, tekst en nummer staan; alleen de status en de reden van annuleren veranderen.
create function public.facturen_onveranderlijk() returns trigger
  language plpgsql set search_path = ''
  as $$
begin
  if (new.tenant_id, new.project_id, new.offerte_id, new.nummer, new.termijn, new.termijn_pct, new.omschrijving, new.toelichting,
      new.factuurdatum, new.vervaldatum, new.bedrag_excl, new.btw_hoog, new.btw_laag, new.totaal_incl, new.meerwerk)
     is distinct from
     (old.tenant_id, old.project_id, old.offerte_id, old.nummer, old.termijn, old.termijn_pct, old.omschrijving, old.toelichting,
      old.factuurdatum, old.vervaldatum, old.bedrag_excl, old.btw_hoog, old.btw_laag, old.totaal_incl, old.meerwerk) then
    raise exception 'Een factuur kan niet worden gewijzigd' using errcode = '55000';
  end if;
  if old.status = 'geannuleerd' and new.status <> 'geannuleerd' then
    raise exception 'Een geannuleerde factuur kan niet opnieuw worden geopend' using errcode = '55000';
  end if;
  return new;
end $$;
create trigger facturen_onveranderlijk before update on public.facturen
  for each row execute function public.facturen_onveranderlijk();

create function public.factuur_betalingen_onveranderlijk() returns trigger
  language plpgsql set search_path = ''
  as $$
begin
  raise exception 'Een betaling kan niet worden gewijzigd' using errcode = '55000';
end $$;
create trigger factuur_betalingen_onveranderlijk before update on public.factuur_betalingen
  for each row execute function public.factuur_betalingen_onveranderlijk();

-- Maakt een termijnfactuur aan. De bedragen rekent de app uit de getekende offerte en het goedgekeurde meerwerk; de database bewaakt de volgorde.
create function public.maak_factuur(
  p_project uuid, p_termijn integer, p_pct numeric, p_omschrijving text, p_toelichting text, p_dagen integer,
  p_excl numeric, p_hoog numeric, p_laag numeric, p_incl numeric, p_meerwerk numeric
) returns jsonb
  language plpgsql security definer set search_path = ''
  as $$
declare
  p public.projecten;
  o public.offertes;
  v_datum date := (now() at time zone 'Europe/Amsterdam')::date;
  v_nummer text;
  v_id uuid;
begin
  select * into p from public.projecten where id = p_project;
  if not found or not public.heeft_rol(p.tenant_id, array['directie','kantoor']::public.gebruikersrol[]) then
    return jsonb_build_object('ok', false, 'fout', 'geen_toegang');
  end if;
  select * into o from public.offertes where project_id = p.id order by versie desc limit 1 for update;
  if not found or o.status <> 'akkoord' then return jsonb_build_object('ok', false, 'fout', 'geen_akkoord'); end if;
  if p_termijn is null or p_termijn < 1 or p_termijn > 10 then return jsonb_build_object('ok', false, 'fout', 'ongeldig'); end if;
  if p_termijn > 1 and not exists (select 1 from public.facturen f where f.project_id = p.id and f.termijn = p_termijn - 1 and f.status <> 'geannuleerd') then
    return jsonb_build_object('ok', false, 'fout', 'volgorde');
  end if;
  if exists (select 1 from public.facturen f where f.project_id = p.id and f.termijn = p_termijn and f.status <> 'geannuleerd') then
    return jsonb_build_object('ok', false, 'fout', 'bestaat_al');
  end if;
  if p_incl is null or p_incl < 0 or p_incl > 10000000 or round(p_excl + p_hoog + p_laag, 2) <> round(p_incl, 2)
     or p_dagen is null or p_dagen < 0 or p_dagen > 90 or p_pct is null or p_pct < 0 or p_pct > 100
     or length(btrim(coalesce(p_omschrijving, ''))) = 0 then
    return jsonb_build_object('ok', false, 'fout', 'ongeldig');
  end if;
  v_nummer := public.volgend_nummer(p.tenant_id, 'factuur');
  insert into public.facturen (tenant_id, project_id, offerte_id, nummer, termijn, termijn_pct, omschrijving, toelichting, factuurdatum, vervaldatum,
                               bedrag_excl, btw_hoog, btw_laag, totaal_incl, meerwerk)
    values (p.tenant_id, p.id, o.id, v_nummer, p_termijn, p_pct, left(btrim(p_omschrijving), 300), left(p_toelichting, 2000), v_datum, v_datum + p_dagen,
            round(p_excl, 2), round(p_hoog, 2), round(p_laag, 2), round(p_incl, 2), coalesce(round(p_meerwerk, 2), 0))
    returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id, 'nummer', v_nummer);
exception when unique_violation then
  return jsonb_build_object('ok', false, 'fout', 'bestaat_al');
end $$;
revoke all on function public.maak_factuur(uuid, integer, numeric, text, text, integer, numeric, numeric, numeric, numeric, numeric) from public, anon;
grant execute on function public.maak_factuur(uuid, integer, numeric, text, text, integer, numeric, numeric, numeric, numeric, numeric) to authenticated;

-- Registreert een betaling. Is het hele bedrag binnen, dan is de factuur betaald.
create function public.registreer_betaling(p_factuur uuid, p_bedrag numeric, p_datum date, p_notitie text) returns jsonb
  language plpgsql security definer set search_path = ''
  as $$
declare
  f public.facturen;
  v_betaald numeric(10, 2);
begin
  select * into f from public.facturen where id = p_factuur for update;
  if not found or not public.heeft_rol(f.tenant_id, array['directie','kantoor']::public.gebruikersrol[]) then
    return jsonb_build_object('ok', false, 'fout', 'geen_toegang');
  end if;
  if f.status <> 'open' then return jsonb_build_object('ok', false, 'fout', 'niet_open'); end if;
  if p_bedrag is null or p_bedrag <= 0 or p_datum is null or p_datum > (now() at time zone 'Europe/Amsterdam')::date + 1 then
    return jsonb_build_object('ok', false, 'fout', 'ongeldig');
  end if;
  select coalesce(sum(bedrag), 0) into v_betaald from public.factuur_betalingen where factuur_id = f.id;
  if v_betaald + round(p_bedrag, 2) > f.totaal_incl then return jsonb_build_object('ok', false, 'fout', 'te_veel'); end if;
  insert into public.factuur_betalingen (tenant_id, factuur_id, bedrag, betaald_op, notitie)
    values (f.tenant_id, f.id, round(p_bedrag, 2), p_datum, left(nullif(btrim(p_notitie), ''), 500));
  if v_betaald + round(p_bedrag, 2) = f.totaal_incl then
    update public.facturen set status = 'betaald' where id = f.id;
  end if;
  return jsonb_build_object('ok', true, 'betaald', v_betaald + round(p_bedrag, 2) = f.totaal_incl);
end $$;
revoke all on function public.registreer_betaling(uuid, numeric, date, text) from public, anon;
grant execute on function public.registreer_betaling(uuid, numeric, date, text) to authenticated;

-- Annuleert een factuur zonder betalingen. Het nummer blijft bestaan; daarna kan de termijn opnieuw worden gefactureerd.
create function public.annuleer_factuur(p_factuur uuid, p_reden text) returns jsonb
  language plpgsql security definer set search_path = ''
  as $$
declare
  f public.facturen;
begin
  select * into f from public.facturen where id = p_factuur for update;
  if not found or not public.heeft_rol(f.tenant_id, array['directie','kantoor']::public.gebruikersrol[]) then
    return jsonb_build_object('ok', false, 'fout', 'geen_toegang');
  end if;
  if f.status <> 'open' then return jsonb_build_object('ok', false, 'fout', 'niet_open'); end if;
  if length(btrim(coalesce(p_reden, ''))) = 0 then return jsonb_build_object('ok', false, 'fout', 'reden'); end if;
  if exists (select 1 from public.factuur_betalingen b where b.factuur_id = f.id) then return jsonb_build_object('ok', false, 'fout', 'heeft_betalingen'); end if;
  update public.facturen set status = 'geannuleerd', annulering_reden = left(btrim(p_reden), 500) where id = f.id;
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.annuleer_factuur(uuid, text) from public, anon;
grant execute on function public.annuleer_factuur(uuid, text) to authenticated;
