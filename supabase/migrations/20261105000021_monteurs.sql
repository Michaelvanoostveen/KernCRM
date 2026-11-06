-- Fase 2, stap 4: monteurs, de samenstelling van de ploegen en de monteur-app (alleen kijken naar de eigen montages, nooit prijzen).
-- De namen en de samenstelling zijn gewone gegevens die directie en kantoor aanpassen. Een monteur kan aan een inlogaccount worden gekoppeld;
-- hij ziet dan de montages van zijn ploeg via een paar beveiligde functies en heeft geen toegang tot de tabellen zelf.

create table public.monteurs (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants (id) on delete cascade,
  naam       text not null check (length(btrim(naam)) > 0),
  actief     boolean not null default true,
  user_id    uuid unique references auth.users (id) on delete set null,   -- het inlogaccount van de monteur, als hij er een heeft
  aangemaakt timestamptz not null default now(),
  unique (tenant_id, naam)
);
create index monteurs_tenant_idx on public.monteurs (tenant_id);

-- Wie zit nu in welke ploeg? Een monteur zit in hooguit één ploeg tegelijk.
create table public.ploeg_leden (
  monteur_id uuid primary key references public.monteurs (id) on delete cascade,
  ploeg_id   uuid not null references public.montageploegen (id) on delete cascade,
  tenant_id  uuid not null references public.tenants (id) on delete cascade,
  aangemaakt timestamptz not null default now()
);
create index ploeg_leden_ploeg_idx on public.ploeg_leden (ploeg_id);
create index ploeg_leden_tenant_idx on public.ploeg_leden (tenant_id);

alter table public.monteurs enable row level security;
alter table public.ploeg_leden enable row level security;

create policy monteurs_lezen on public.monteurs for select to authenticated
  using (public.heeft_rol(tenant_id, array['directie','kantoor','verkoop']::public.gebruikersrol[]));
create policy monteurs_beheren on public.monteurs for all to authenticated
  using (public.heeft_rol(tenant_id, array['directie','kantoor']::public.gebruikersrol[]))
  with check (public.heeft_rol(tenant_id, array['directie','kantoor']::public.gebruikersrol[]));
create policy ploeg_leden_lezen on public.ploeg_leden for select to authenticated
  using (public.heeft_rol(tenant_id, array['directie','kantoor','verkoop']::public.gebruikersrol[]));
create policy ploeg_leden_beheren on public.ploeg_leden for all to authenticated
  using (public.heeft_rol(tenant_id, array['directie','kantoor']::public.gebruikersrol[]))
  with check (public.heeft_rol(tenant_id, array['directie','kantoor']::public.gebruikersrol[]));

-- Een monteur hoort bij één bedrijf, een gekoppeld account moet monteur zijn in hetzelfde bedrijf.
create function public.monteurs_bewaken() returns trigger
  language plpgsql security definer set search_path = ''
  as $$
begin
  if tg_op = 'UPDATE' and new.tenant_id is distinct from old.tenant_id then
    raise exception 'Een monteur kan niet naar een ander bedrijf verhuizen' using errcode = '55000';
  end if;
  if new.user_id is not null and not exists (
    select 1 from public.tenant_leden l where l.tenant_id = new.tenant_id and l.user_id = new.user_id and l.rol = 'monteur'
  ) then
    raise exception 'Dit account is geen monteur van dit bedrijf' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger monteurs_bewaken before insert or update on public.monteurs
  for each row execute function public.monteurs_bewaken();

-- Monteur en ploeg horen bij hetzelfde bedrijf; alleen een actieve monteur en een actieve ploeg kunnen worden gekoppeld.
create function public.ploeg_leden_bewaken() returns trigger
  language plpgsql security definer set search_path = ''
  as $$
begin
  if not exists (select 1 from public.monteurs m where m.id = new.monteur_id and m.tenant_id = new.tenant_id and m.actief)
     or not exists (select 1 from public.montageploegen p where p.id = new.ploeg_id and p.tenant_id = new.tenant_id and p.actief) then
    raise exception 'Kies een actieve monteur en een actieve ploeg van hetzelfde bedrijf' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger ploeg_leden_bewaken before insert or update on public.ploeg_leden
  for each row execute function public.ploeg_leden_bewaken();

-- Een monteur die uit dienst gaat, verlaat zijn ploeg.
create function public.monteur_uit_dienst() returns trigger
  language plpgsql security definer set search_path = ''
  as $$
begin
  if old.actief and not new.actief then delete from public.ploeg_leden where monteur_id = new.id; end if;
  return new;
end $$;
create trigger monteur_uit_dienst after update on public.monteurs
  for each row execute function public.monteur_uit_dienst();

-- Het monteur-id van de ingelogde gebruiker, als hij een actieve, gekoppelde monteur is.
create function public.mijn_monteur() returns uuid
  language sql stable security definer set search_path = ''
  as $$ select m.id from public.monteurs m where m.user_id = auth.uid() and m.actief limit 1 $$;
revoke all on function public.mijn_monteur() from public, anon;
grant execute on function public.mijn_monteur() to authenticated;

-- Mag de ingelogde gebruiker deze montage zien? Een monteur alleen als hij in de ploeg zit en de montage definitief is; medewerkers altijd.
create function public.monteur_toegang(p_montage uuid) returns boolean
  language sql stable security definer set search_path = ''
  as $$
  select exists (
    select 1 from public.montages mo
    where mo.id = p_montage
      and (
        public.heeft_rol(mo.tenant_id, array['directie','kantoor']::public.gebruikersrol[])
        or (
          mo.status in ('definitief', 'bezig', 'afgerond')
          and exists (
            select 1 from public.ploeg_leden pl join public.monteurs m on m.id = pl.monteur_id
            where pl.ploeg_id = mo.ploeg_id and m.user_id = auth.uid() and m.actief
          )
        )
      )
  )
$$;
revoke all on function public.monteur_toegang(uuid) from public, anon;
grant execute on function public.monteur_toegang(uuid) to authenticated;

-- De montages van mijn ploeg: komend en lopend, plus wat de laatste twee weken is afgerond. Zonder prijzen.
create function public.monteur_overzicht() returns jsonb
  language sql stable security definer set search_path = ''
  as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', mo.id, 'status', mo.status, 'start_datum', mo.start_datum, 'eind_datum', mo.eind_datum, 'werkdagen', mo.werkdagen,
    'leverdatum', mo.leverdatum, 'hulpmiddel', mo.hulpmiddel,
    'project_naam', p.naam, 'project_nummer', p.nummer, 'klant_naam', k.naam,
    'adres', (select a.straat || ' ' || a.huisnummer || coalesce(' ' || a.toevoeging, '') from public.adressen a where a.klant_id = k.id and a.tenant_id = mo.tenant_id and a.soort = 'project' order by a.aangemaakt limit 1),
    'plaats', (select a.plaats from public.adressen a where a.klant_id = k.id and a.tenant_id = mo.tenant_id and a.soort = 'project' order by a.aangemaakt limit 1),
    'ploeg', pg.naam
  ) order by mo.start_datum), '[]'::jsonb)
  from public.montages mo
  join public.projecten p on p.id = mo.project_id and p.tenant_id = mo.tenant_id
  join public.klanten k on k.id = p.klant_id and k.tenant_id = mo.tenant_id
  join public.montageploegen pg on pg.id = mo.ploeg_id
  where mo.status in ('definitief', 'bezig', 'afgerond')
    and (mo.status <> 'afgerond' or mo.eind_datum >= (now() at time zone 'Europe/Amsterdam')::date - 14)
    and exists (
      select 1 from public.ploeg_leden pl join public.monteurs m on m.id = pl.monteur_id
      where pl.ploeg_id = mo.ploeg_id and m.user_id = auth.uid() and m.actief
    )
$$;
revoke all on function public.monteur_overzicht() from public, anon;
grant execute on function public.monteur_overzicht() to authenticated;

-- Alles wat de ploeg nodig heeft voor één montage: adres, contact, wat er gemaakt wordt (met de door de klant goedgekeurde wijzigingen), de maten
-- uit de inmeting en de extra's. Nooit prijzen.
create function public.monteur_detail(p_montage uuid) returns jsonb
  language plpgsql stable security definer set search_path = ''
  as $$
declare
  v_json jsonb;
begin
  if not public.monteur_toegang(p_montage) then return null; end if;
  select jsonb_build_object(
    'id', mo.id, 'status', mo.status, 'start_datum', mo.start_datum, 'eind_datum', mo.eind_datum, 'werkdagen', mo.werkdagen,
    'leverdatum', mo.leverdatum, 'hulpmiddel', mo.hulpmiddel, 'notitie', mo.notitie,
    'project_nummer', p.nummer, 'project_naam', p.naam, 'klant_naam', k.naam, 'telefoon', k.telefoon, 'mobiel', k.mobiel,
    'adres', (select jsonb_build_object('straat', a.straat, 'huisnummer', a.huisnummer, 'toevoeging', a.toevoeging, 'postcode', a.postcode, 'plaats', a.plaats, 'bereikbaarheid', a.bereikbaarheid, 'woningtype', a.woningtype, 'bouwjaar', a.bouwjaar)
              from public.adressen a where a.klant_id = k.id and a.tenant_id = mo.tenant_id and a.soort = 'project' order by a.aangemaakt limit 1),
    'ploeg', pg.naam,
    'collegas', (select coalesce(jsonb_agg(m.naam order by m.naam), '[]'::jsonb) from public.ploeg_leden pl join public.monteurs m on m.id = pl.monteur_id where pl.ploeg_id = mo.ploeg_id),
    'posities', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'positie_id', ps.id, 'nummer', ps.nummer, 'ruimte', ps.ruimte, 'aantal', ps.aantal,
        -- de configuratie zoals de klant die goedkeurde: met de goedgekeurde wijziging als die er is
        'config', coalesce((select w.nieuwe_config from public.inmeting_wijzigingen w join public.inmetingen i on i.id = w.inmeting_id
                            where i.offerte_id = mo.offerte_id and w.positie_id = ps.id and w.soort = 'configuratie' and w.status = 'akkoord'
                            order by w.aangemaakt desc limit 1), ps.config),
        'gewijzigd', exists (select 1 from public.inmeting_wijzigingen w join public.inmetingen i on i.id = w.inmeting_id
                             where i.offerte_id = mo.offerte_id and w.positie_id = ps.id and w.soort = 'configuratie' and w.status = 'akkoord'),
        'gemeten', (select jsonb_build_object('bestel_breedte_mm', r.bestel_breedte_mm, 'bestel_hoogte_mm', r.bestel_hoogte_mm,
                           'binnen_breedte_mm', r.binnen_breedte_mm, 'binnen_hoogte_mm', r.binnen_hoogte_mm,
                           'buiten_breedte_mm', r.buiten_breedte_mm, 'buiten_hoogte_mm', r.buiten_hoogte_mm, 'opmerking', r.opmerking)
                    from public.inmeting_regels r join public.inmetingen i on i.id = r.inmeting_id
                    where i.offerte_id = mo.offerte_id and i.status = 'uitgevoerd' and r.positie_id = ps.id order by i.uitgevoerd_op desc limit 1)
      ) order by ps.nummer), '[]'::jsonb)
      from public.posities ps where ps.offerte_id = mo.offerte_id and ps.tenant_id = mo.tenant_id
    ),
    'extras', (
      select coalesce(jsonb_agg(jsonb_build_object('omschrijving', w.omschrijving, 'aantal', w.aantal, 'positie_id', w.positie_id) order by w.aangemaakt), '[]'::jsonb)
      from public.inmeting_wijzigingen w join public.inmetingen i on i.id = w.inmeting_id
      where i.offerte_id = mo.offerte_id and w.soort = 'extra' and w.status = 'akkoord'
    )
  ) into v_json
  from public.montages mo
  join public.projecten p on p.id = mo.project_id and p.tenant_id = mo.tenant_id
  join public.klanten k on k.id = p.klant_id and k.tenant_id = mo.tenant_id
  join public.montageploegen pg on pg.id = mo.ploeg_id
  where mo.id = p_montage;
  return v_json;
end $$;
revoke all on function public.monteur_detail(uuid) from public, anon;
grant execute on function public.monteur_detail(uuid) to authenticated;
