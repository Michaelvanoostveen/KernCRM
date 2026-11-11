-- Fase 3: meerwerk dat de monteur ter plekke voorstelt, met akkoord van de klant. De monteur kiest een artikel uit de catalogus (de prijs komt uit
-- de catalogus, nooit van de monteur), de klant ziet de prijs en tekent op het scherm van de monteur. Goedgekeurd meerwerk telt mee in de opdracht
-- en komt op de eindfactuur. Opleveren kan pas als er geen voorstel meer openstaat zonder akkoord. Net als bij de inmeting staat het akkoord vast.

create table public.werkbon_meerwerk_akkoorden (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants (id) on delete cascade,
  werkbon_id    uuid not null references public.werkbonnen (id) on delete cascade,
  naam          text not null check (length(btrim(naam)) >= 3),
  handtekening  text not null,
  ip            text,
  user_agent    text,
  totaal        numeric(10, 2) not null,
  op            timestamptz not null default now()
);
create index werkbon_meerwerk_akkoorden_werkbon_idx on public.werkbon_meerwerk_akkoorden (werkbon_id);
create index werkbon_meerwerk_akkoorden_tenant_idx on public.werkbon_meerwerk_akkoorden (tenant_id);

create table public.werkbon_meerwerk (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants (id) on delete cascade,
  werkbon_id    uuid not null references public.werkbonnen (id) on delete cascade,
  positie_id    uuid references public.posities (id) on delete cascade,
  artikel_id    uuid references public.artikelen (id) on delete set null,
  aantal        integer not null default 1 check (aantal between 1 and 100),
  omschrijving  text not null check (length(btrim(omschrijving)) > 0),
  meerprijs     numeric(10, 2) not null check (meerprijs > 0),     -- incl. btw, voor het totale aantal
  status        text not null default 'voorgesteld' check (status in ('voorgesteld', 'akkoord', 'vervallen')),
  akkoord_id    uuid references public.werkbon_meerwerk_akkoorden (id) on delete set null,
  voorgesteld_door uuid default auth.uid() references auth.users (id) on delete set null,
  aangemaakt    timestamptz not null default now(),
  check ((status = 'akkoord') = (akkoord_id is not null) or status = 'vervallen')
);
create index werkbon_meerwerk_werkbon_idx on public.werkbon_meerwerk (werkbon_id);
create index werkbon_meerwerk_tenant_idx on public.werkbon_meerwerk (tenant_id);

alter table public.werkbon_meerwerk_akkoorden enable row level security;
alter table public.werkbon_meerwerk enable row level security;
create policy werkbon_meerwerk_akkoorden_lezen on public.werkbon_meerwerk_akkoorden for select to authenticated
  using (public.heeft_rol(tenant_id, array['directie','kantoor']::public.gebruikersrol[]));
create policy werkbon_meerwerk_lezen on public.werkbon_meerwerk for select to authenticated
  using (public.heeft_rol(tenant_id, array['directie','kantoor','verkoop']::public.gebruikersrol[]));
revoke insert, update, delete, truncate on public.werkbon_meerwerk_akkoorden, public.werkbon_meerwerk from authenticated, anon;

-- Het akkoord van de klant is bewijs en staat vast. Een goedgekeurd onderdeel kan niet meer worden aangepast of verwijderd; alleen de naam van wie het voorstelde
-- wordt leeg als die gebruiker uit het systeem verdwijnt.
create function public.werkbon_meerwerk_vergrendelen() returns trigger
  language plpgsql set search_path = ''
  as $$
begin
  if tg_table_name = 'werkbon_meerwerk_akkoorden' then
    raise exception 'Het akkoord van de klant kan niet worden gewijzigd of verwijderd' using errcode = '55000';
  end if;
  if old.status = 'akkoord' then
    -- Verdwijnt een gebruiker of een artikel uit het systeem, dan worden die verwijzingen leeg; omschrijving en prijs staan al in de rij.
    if tg_op = 'UPDATE' and (to_jsonb(new) - 'voorgesteld_door' - 'artikel_id') = (to_jsonb(old) - 'voorgesteld_door' - 'artikel_id')
       and (new.voorgesteld_door is null or new.voorgesteld_door = old.voorgesteld_door)
       and (new.artikel_id is null or new.artikel_id = old.artikel_id) then
      return new;
    end if;
    raise exception 'Goedgekeurd meerwerk kan niet meer worden gewijzigd of verwijderd' using errcode = '55000';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
create trigger werkbon_meerwerk_akkoorden_vergrendelen before update or delete on public.werkbon_meerwerk_akkoorden
  for each row execute function public.werkbon_meerwerk_vergrendelen();
create trigger werkbon_meerwerk_vergrendelen before update or delete on public.werkbon_meerwerk
  for each row execute function public.werkbon_meerwerk_vergrendelen();
create trigger werkbon_meerwerk_akkoorden_niet_legen before truncate on public.werkbon_meerwerk_akkoorden
  for each statement execute function public.werkbon_meerwerk_vergrendelen();

-- Goedgekeurd meerwerk telt mee in de opdracht: dat van de inmeting plus dat van de werkbon(nen) van deze offerte.
create or replace function public.goedgekeurd_meerwerk(p_offerte uuid) returns numeric
  language sql stable security definer set search_path = ''
  as $$
  select coalesce((select sum(w.meerprijs)
                   from public.inmeting_wijzigingen w join public.inmetingen i on i.id = w.inmeting_id
                   where i.offerte_id = p_offerte and w.status = 'akkoord'), 0)
       + coalesce((select sum(x.meerprijs)
                   from public.werkbon_meerwerk x join public.werkbonnen wb on wb.id = x.werkbon_id join public.montages mo on mo.id = wb.montage_id
                   where mo.offerte_id = p_offerte and x.status = 'akkoord'), 0)
$$;

-- De artikelen die de monteur kan kiezen, met de prijs die de klant te zien krijgt. Alleen zolang hij aan de werkbon mag schrijven.
create function public.werkbon_meerwerk_artikelen(p_montage uuid) returns jsonb
  language plpgsql stable security definer set search_path = ''
  as $$
declare
  v_tenant uuid;
begin
  if not public.werkbon_schrijven(p_montage) then return '[]'::jsonb; end if;
  select tenant_id into v_tenant from public.montages where id = p_montage;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', a.id, 'groep', a.groep, 'naam', a.naam, 'eenheid', a.eenheid, 'prijs', a.verkoopprijs_incl) order by a.groep, a.naam)
    from public.artikelen a where a.tenant_id = v_tenant and a.actief
  ), '[]'::jsonb);
end $$;
revoke all on function public.werkbon_meerwerk_artikelen(uuid) from public, anon;
grant execute on function public.werkbon_meerwerk_artikelen(uuid) to authenticated;

-- Stelt een artikel uit de catalogus voor als meerwerk. De prijs komt uit de catalogus.
create function public.werkbon_meerwerk_toevoegen(p_montage uuid, p_positie uuid, p_artikel uuid, p_aantal integer) returns jsonb
  language plpgsql security definer set search_path = ''
  as $$
declare
  w public.werkbonnen;
  m public.montages;
  a public.artikelen;
begin
  w := public.werkbon_open(p_montage);
  if w.id is null then return jsonb_build_object('ok', false, 'fout', 'niet_beschikbaar'); end if;
  select * into m from public.montages where id = p_montage;
  -- Zelfde volgorde van vergrendelen als elders (montage, werkbon, offerte), zodat er geen meerwerk bijkomt terwijl de eindfactuur wordt gemaakt.
  perform 1 from public.offertes where id = m.offerte_id for update;
  if p_aantal is null or p_aantal < 1 or p_aantal > 100 then return jsonb_build_object('ok', false, 'fout', 'aantal'); end if;
  if (select count(*) from public.werkbon_meerwerk x where x.werkbon_id = w.id and x.status <> 'vervallen') >= 20 then
    return jsonb_build_object('ok', false, 'fout', 'te_veel');
  end if;
  -- Is alles al gefactureerd (100% van de termijnen), dan zou het meerwerk op geen enkele factuur meer komen: kantoor moet dat eerst oplossen.
  if (select coalesce(sum(f.termijn_pct), 0) from public.facturen f where f.offerte_id = m.offerte_id and f.status not in ('geannuleerd', 'gecrediteerd')) >= 99.99 then
    return jsonb_build_object('ok', false, 'fout', 'eindfactuur');
  end if;
  select * into a from public.artikelen where id = p_artikel and tenant_id = m.tenant_id and actief;
  if not found then return jsonb_build_object('ok', false, 'fout', 'artikel'); end if;
  if p_positie is not null and not exists (select 1 from public.posities ps where ps.id = p_positie and ps.offerte_id = m.offerte_id and ps.tenant_id = m.tenant_id) then
    return jsonb_build_object('ok', false, 'fout', 'positie');
  end if;
  if a.verkoopprijs_incl <= 0 or a.verkoopprijs_incl * p_aantal > 100000 then return jsonb_build_object('ok', false, 'fout', 'artikel'); end if;
  insert into public.werkbon_meerwerk (tenant_id, werkbon_id, positie_id, artikel_id, aantal, omschrijving, meerprijs)
    values (m.tenant_id, w.id, p_positie, a.id, p_aantal, a.naam, round(a.verkoopprijs_incl * p_aantal, 2));
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.werkbon_meerwerk_toevoegen(uuid, uuid, uuid, integer) from public, anon;
grant execute on function public.werkbon_meerwerk_toevoegen(uuid, uuid, uuid, integer) to authenticated;

-- Haalt een voorstel weg zolang de klant er geen akkoord op heeft gegeven.
create function public.werkbon_meerwerk_verwijderen(p_montage uuid, p_meerwerk uuid) returns jsonb
  language plpgsql security definer set search_path = ''
  as $$
declare
  w public.werkbonnen;
  v_aantal integer;
begin
  w := public.werkbon_open(p_montage);
  if w.id is null then return jsonb_build_object('ok', false, 'fout', 'niet_beschikbaar'); end if;
  update public.werkbon_meerwerk set status = 'vervallen' where id = p_meerwerk and werkbon_id = w.id and status = 'voorgesteld';
  get diagnostics v_aantal = row_count;
  if v_aantal = 0 then return jsonb_build_object('ok', false, 'fout', 'niet_te_verwijderen'); end if;
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.werkbon_meerwerk_verwijderen(uuid, uuid) from public, anon;
grant execute on function public.werkbon_meerwerk_verwijderen(uuid, uuid) to authenticated;

-- Legt het akkoord van de klant vast voor alle openstaande voorstellen. Alleen een monteur (of de directie): kantoor tekent niet namens de klant.
create function public.werkbon_meerwerk_akkoord(p_montage uuid, p_naam text, p_handtekening text, p_ip text, p_user_agent text, p_verwacht_totaal numeric) returns jsonb
  language plpgsql security definer set search_path = ''
  as $$
declare
  w public.werkbonnen;
  m public.montages;
  v_totaal numeric(10, 2);
  v_akkoord uuid;
begin
  if public.mijn_monteur() is null and not exists (select 1 from public.montages mm where mm.id = p_montage and public.heeft_rol(mm.tenant_id, array['directie']::public.gebruikersrol[])) then
    return jsonb_build_object('ok', false, 'fout', 'alleen_monteur');
  end if;
  w := public.werkbon_open(p_montage);
  if w.id is null then return jsonb_build_object('ok', false, 'fout', 'niet_beschikbaar'); end if;
  select * into m from public.montages where id = p_montage;
  perform 1 from public.offertes where id = m.offerte_id for update;
  if length(btrim(coalesce(p_naam, ''))) < 3 or length(p_naam) > 120 then return jsonb_build_object('ok', false, 'fout', 'naam'); end if;
  if p_handtekening is null or p_handtekening !~ '^data:image/png;base64,[A-Za-z0-9+/]+={0,2}$' or length(p_handtekening) < 200 or length(p_handtekening) > 400000 then
    return jsonb_build_object('ok', false, 'fout', 'handtekening');
  end if;
  select coalesce(sum(meerprijs), 0) into v_totaal from public.werkbon_meerwerk where werkbon_id = w.id and status = 'voorgesteld';
  if v_totaal = 0 then return jsonb_build_object('ok', false, 'fout', 'leeg'); end if;
  -- De klant tekent voor het bedrag dat hij zag. Is er sindsdien iets veranderd, dan moet hij opnieuw kijken.
  if p_verwacht_totaal is null or round(p_verwacht_totaal, 2) <> v_totaal then return jsonb_build_object('ok', false, 'fout', 'gewijzigd'); end if;
  -- Is intussen alles gefactureerd, dan zou het meerwerk op geen enkele factuur meer komen.
  if (select coalesce(sum(f.termijn_pct), 0) from public.facturen f where f.offerte_id = m.offerte_id and f.status not in ('geannuleerd', 'gecrediteerd')) >= 99.99 then
    return jsonb_build_object('ok', false, 'fout', 'eindfactuur');
  end if;
  insert into public.werkbon_meerwerk_akkoorden (tenant_id, werkbon_id, naam, handtekening, ip, user_agent, totaal)
    values (m.tenant_id, w.id, btrim(p_naam), p_handtekening, left(p_ip, 80), left(p_user_agent, 300), v_totaal)
    returning id into v_akkoord;
  update public.werkbon_meerwerk set status = 'akkoord', akkoord_id = v_akkoord where werkbon_id = w.id and status = 'voorgesteld';
  return jsonb_build_object('ok', true, 'totaal', v_totaal);
end $$;
revoke all on function public.werkbon_meerwerk_akkoord(uuid, text, text, text, text, numeric) from public, anon;
grant execute on function public.werkbon_meerwerk_akkoord(uuid, text, text, text, text, numeric) to authenticated;

-- Bij annuleren van de montage vervallen de voorstellen waar de klant nog niet voor heeft getekend.
create function public.werkbon_meerwerk_montage_geannuleerd() returns trigger
  language plpgsql security definer set search_path = ''
  as $$
begin
  if new.status = 'geannuleerd' and old.status <> 'geannuleerd' then
    update public.werkbon_meerwerk x set status = 'vervallen'
      from public.werkbonnen wb where wb.id = x.werkbon_id and wb.montage_id = new.id and x.status = 'voorgesteld';
  end if;
  return new;
end $$;
create trigger montages_meerwerk_opruimen after update on public.montages
  for each row execute function public.werkbon_meerwerk_montage_geannuleerd();

-- De werkbon bevat nu ook het meerwerk, en opleveren kan niet met meerwerk zonder akkoord.
-- Let op: dit is de enige uitzondering op "geen prijzen voor de monteur": de monteur ziet de prijs van het meerwerk dat hij voorstelt, omdat de klant het bedrag moet zien.
create or replace function public.werkbon_laad(p_montage uuid) returns jsonb
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
    'meerwerk', (select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'positie_id', x.positie_id, 'omschrijving', x.omschrijving, 'aantal', x.aantal, 'meerprijs', x.meerprijs, 'status', x.status) order by x.aangemaakt), '[]'::jsonb)
                 from public.werkbon_meerwerk x where x.werkbon_id = w.id and x.status <> 'vervallen'),
    'akkoord', (select jsonb_build_object('naam', a.naam, 'op', a.op, 'met_voorbehoud', a.met_voorbehoud, 'aantal_open_punten', a.aantal_open_punten)
                from public.werkbon_akkoorden a where a.werkbon_id = w.id)
  );
end $$;

create or replace function public.werkbon_opleveren(p_montage uuid, p_naam text, p_handtekening text, p_ip text, p_user_agent text) returns jsonb
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
  -- Meerwerk waar de klant nog niet voor heeft getekend, moet eerst een akkoord krijgen of worden verwijderd.
  if exists (select 1 from public.werkbon_meerwerk x where x.werkbon_id = w.id and x.status = 'voorgesteld') then
    return jsonb_build_object('ok', false, 'fout', 'meerwerk_open');
  end if;
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
