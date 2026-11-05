-- Fase 2, stap 2: wijzigingen en extra's tijdens de inmeting, met akkoord van de klant ter plekke.
-- De inmeter stelt een andere indeling, draairichting, kleur of glas voor, of voegt een artikel uit de catalogus toe.
-- Hij ziet alleen de meerprijs van zijn eigen voorstellen. De klant tekent daarvoor op de telefoon; afronden kan pas daarna.

create table public.inmeting_akkoorden (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants (id) on delete cascade,
  inmeting_id     uuid not null references public.inmetingen (id) on delete cascade,
  naam            text not null check (length(btrim(naam)) >= 3),
  handtekening    text not null,
  ip              text,
  user_agent      text,
  totaal_meerprijs numeric(10, 2) not null,
  op              timestamptz not null default now()
);
create index inmeting_akkoorden_inmeting_idx on public.inmeting_akkoorden (inmeting_id);
create index inmeting_akkoorden_tenant_idx on public.inmeting_akkoorden (tenant_id);

create table public.inmeting_wijzigingen (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants (id) on delete cascade,
  inmeting_id   uuid not null references public.inmetingen (id) on delete cascade,
  positie_id    uuid references public.posities (id) on delete cascade,
  soort         text not null check (soort in ('configuratie', 'extra')),
  nieuwe_config jsonb,                                   -- bij soort 'configuratie': de volledige nieuwe configuratie van de positie
  artikel_id    uuid references public.artikelen (id) on delete set null,
  aantal        integer not null default 1 check (aantal between 1 and 100),
  omschrijving  text not null check (length(btrim(omschrijving)) > 0),
  meerprijs     numeric(10, 2) not null,                 -- incl. btw, voor het totale aantal; kan negatief zijn
  status        text not null default 'voorgesteld' check (status in ('voorgesteld', 'akkoord', 'vervallen')),
  akkoord_id    uuid references public.inmeting_akkoorden (id) on delete set null,
  voorgesteld_door uuid default auth.uid() references auth.users (id) on delete set null,
  aangemaakt    timestamptz not null default now(),
  check (soort <> 'configuratie' or (positie_id is not null and nieuwe_config is not null))
);
create index inmeting_wijzigingen_inmeting_idx on public.inmeting_wijzigingen (inmeting_id);
create index inmeting_wijzigingen_tenant_idx on public.inmeting_wijzigingen (tenant_id);
-- Per positie is er hoogstens één lopend voorstel voor de configuratie.
create unique index inmeting_wijzigingen_een_config on public.inmeting_wijzigingen (inmeting_id, positie_id)
  where soort = 'configuratie' and status = 'voorgesteld';

alter table public.inmeting_akkoorden enable row level security;
alter table public.inmeting_wijzigingen enable row level security;

-- Alleen lezen voor medewerkers. Schrijven gebeurt uitsluitend via de functies hieronder.
create policy inmeting_akkoorden_lezen on public.inmeting_akkoorden for select to authenticated
  using (public.heeft_rol(tenant_id, array['directie','verkoop','kantoor']::public.gebruikersrol[]));
create policy inmeting_wijzigingen_lezen on public.inmeting_wijzigingen for select to authenticated
  using (public.heeft_rol(tenant_id, array['directie','verkoop','kantoor']::public.gebruikersrol[]));

-- Welke artikelen kan de inmeter toevoegen? Alleen namen, nooit prijzen.
create function public.inmeting_extra_artikelen(p_inmeting uuid) returns jsonb
  language plpgsql stable security definer set search_path = ''
  as $$
declare
  v_tenant uuid;
begin
  if not public.inmeting_toegang(p_inmeting) then return '[]'::jsonb; end if;
  select tenant_id into v_tenant from public.inmetingen where id = p_inmeting;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', a.id, 'groep', a.groep, 'naam', a.naam, 'eenheid', a.eenheid) order by a.groep, a.naam)
    from public.artikelen a where a.tenant_id = v_tenant and a.actief
  ), '[]'::jsonb);
end $$;
revoke all on function public.inmeting_extra_artikelen(uuid) from public, anon;
grant execute on function public.inmeting_extra_artikelen(uuid) to authenticated;

-- De voorstellen van deze inmeting, met meerprijs. Voor de inmeter en voor medewerkers.
create function public.inmeting_wijzigingen_lijst(p_inmeting uuid) returns jsonb
  language plpgsql stable security definer set search_path = ''
  as $$
begin
  if not public.inmeting_toegang(p_inmeting) then return '[]'::jsonb; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', w.id, 'positie_id', w.positie_id, 'soort', w.soort, 'nieuwe_config', w.nieuwe_config,
      'omschrijving', w.omschrijving, 'aantal', w.aantal, 'meerprijs', w.meerprijs, 'status', w.status
    ) order by w.aangemaakt)
    from public.inmeting_wijzigingen w
    join public.inmetingen i on i.id = w.inmeting_id
    where w.inmeting_id = p_inmeting and w.status <> 'vervallen'
      and (w.voorgesteld_door = auth.uid() or public.heeft_rol(i.tenant_id, array['directie','verkoop','kantoor']::public.gebruikersrol[]))
  ), '[]'::jsonb);
end $$;
revoke all on function public.inmeting_wijzigingen_lijst(uuid) from public, anon;
grant execute on function public.inmeting_wijzigingen_lijst(uuid) to authenticated;

-- Stelt een andere configuratie voor een positie voor. De meerprijs berekent de server met de prijsmodule.
create function public.inmeting_stel_config_voor(p_inmeting uuid, p_positie uuid, p_config jsonb, p_omschrijving text, p_meerprijs numeric) returns jsonb
  language plpgsql security definer set search_path = ''
  as $$
declare
  i public.inmetingen;
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
  -- Alleen indeling, vaktypes, kleur en glas mogen veranderen; product, maat, beslag, binnenafwerking en profiel blijven zoals in de offerte.
  if exists (
    select 1 from public.posities ps, unnest(array['product', 'w', 'h', 'beslag', 'binnen', 'profiel']) k
    where ps.id = p_positie and (p_config -> k) is distinct from (ps.config -> k)
  ) then
    return jsonb_build_object('ok', false, 'fout', 'ongeldig');
  end if;
  if exists (select 1 from public.inmeting_wijzigingen where inmeting_id = i.id and positie_id = p_positie and soort = 'configuratie' and status = 'akkoord') then
    return jsonb_build_object('ok', false, 'fout', 'al_akkoord');
  end if;
  update public.inmeting_wijzigingen set status = 'vervallen'
    where inmeting_id = i.id and positie_id = p_positie and soort = 'configuratie' and status = 'voorgesteld';
  insert into public.inmeting_wijzigingen (tenant_id, inmeting_id, positie_id, soort, nieuwe_config, omschrijving, meerprijs, voorgesteld_door)
    values (i.tenant_id, i.id, p_positie, 'configuratie', p_config, left(btrim(p_omschrijving), 500), round(p_meerprijs, 2), auth.uid());
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.inmeting_stel_config_voor(uuid, uuid, jsonb, text, numeric) from public, anon;
grant execute on function public.inmeting_stel_config_voor(uuid, uuid, jsonb, text, numeric) to authenticated;

-- Voegt een artikel uit de catalogus toe. De prijs komt uit de catalogus, nooit van de inmeter.
create function public.inmeting_voeg_extra_toe(p_inmeting uuid, p_positie uuid, p_artikel uuid, p_aantal integer) returns jsonb
  language plpgsql security definer set search_path = ''
  as $$
declare
  i public.inmetingen;
  a public.artikelen;
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
  insert into public.inmeting_wijzigingen (tenant_id, inmeting_id, positie_id, soort, artikel_id, aantal, omschrijving, meerprijs, voorgesteld_door)
    values (i.tenant_id, i.id, p_positie, 'extra', a.id, p_aantal, a.naam, round(a.verkoopprijs_incl * p_aantal, 2), auth.uid());
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.inmeting_voeg_extra_toe(uuid, uuid, uuid, integer) from public, anon;
grant execute on function public.inmeting_voeg_extra_toe(uuid, uuid, uuid, integer) to authenticated;

-- Haalt een voorstel weg zolang de klant er geen akkoord op heeft gegeven.
create function public.inmeting_verwijder_wijziging(p_inmeting uuid, p_wijziging uuid) returns jsonb
  language plpgsql security definer set search_path = ''
  as $$
declare
  i public.inmetingen;
  v_aantal integer;
begin
  if not public.inmeting_toegang(p_inmeting) then return jsonb_build_object('ok', false, 'fout', 'geen_toegang'); end if;
  select * into i from public.inmetingen where id = p_inmeting for update;
  if i.status <> 'gepland' then return jsonb_build_object('ok', false, 'fout', 'afgerond'); end if;
  update public.inmeting_wijzigingen set status = 'vervallen'
    where id = p_wijziging and inmeting_id = p_inmeting and status = 'voorgesteld';
  get diagnostics v_aantal = row_count;
  if v_aantal = 0 then return jsonb_build_object('ok', false, 'fout', 'niet_te_verwijderen'); end if;
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.inmeting_verwijder_wijziging(uuid, uuid) from public, anon;
grant execute on function public.inmeting_verwijder_wijziging(uuid, uuid) to authenticated;

-- Legt het akkoord van de klant vast voor alle openstaande voorstellen.
create function public.inmeting_wijzigingen_akkoord(p_inmeting uuid, p_naam text, p_handtekening text, p_ip text, p_user_agent text, p_verwacht_totaal numeric) returns jsonb
  language plpgsql security definer set search_path = ''
  as $$
declare
  i public.inmetingen;
  v_totaal numeric(10, 2);
  v_akkoord uuid;
begin
  if not public.inmeting_toegang(p_inmeting) then return jsonb_build_object('ok', false, 'fout', 'geen_toegang'); end if;
  select * into i from public.inmetingen where id = p_inmeting for update;
  if i.status <> 'gepland' then return jsonb_build_object('ok', false, 'fout', 'afgerond'); end if;
  if length(btrim(coalesce(p_naam, ''))) < 3 or length(p_naam) > 120 then return jsonb_build_object('ok', false, 'fout', 'naam'); end if;
  if p_handtekening is null or p_handtekening not like 'data:image/png;base64,%' or length(p_handtekening) < 200 or length(p_handtekening) > 400000 then
    return jsonb_build_object('ok', false, 'fout', 'handtekening');
  end if;
  if not exists (select 1 from public.inmeting_wijzigingen where inmeting_id = i.id and status = 'voorgesteld') then
    return jsonb_build_object('ok', false, 'fout', 'leeg');
  end if;
  select coalesce(sum(meerprijs), 0) into v_totaal from public.inmeting_wijzigingen where inmeting_id = i.id and status = 'voorgesteld';
  -- De klant tekent voor het bedrag dat hij zag. Is er sindsdien iets veranderd, dan moet hij opnieuw kijken.
  if p_verwacht_totaal is null or round(p_verwacht_totaal, 2) <> v_totaal then
    return jsonb_build_object('ok', false, 'fout', 'gewijzigd');
  end if;
  insert into public.inmeting_akkoorden (tenant_id, inmeting_id, naam, handtekening, ip, user_agent, totaal_meerprijs)
    values (i.tenant_id, i.id, btrim(p_naam), p_handtekening, left(p_ip, 80), left(p_user_agent, 300), v_totaal)
    returning id into v_akkoord;
  update public.inmeting_wijzigingen set status = 'akkoord', akkoord_id = v_akkoord where inmeting_id = i.id and status = 'voorgesteld';
  return jsonb_build_object('ok', true, 'totaal', v_totaal);
end $$;
revoke all on function public.inmeting_wijzigingen_akkoord(uuid, text, text, text, text, numeric) from public, anon;
grant execute on function public.inmeting_wijzigingen_akkoord(uuid, text, text, text, text, numeric) to authenticated;

-- Afronden kan pas als er geen voorstellen meer openstaan zonder akkoord van de klant.
create or replace function public.inmeting_afronden(p_inmeting uuid) returns jsonb
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
      and not exists (select 1 from public.inmeting_regels r where r.inmeting_id = i.id and r.positie_id = ps.id and r.bestel_breedte_mm is not null and r.bestel_hoogte_mm is not null);
  if v_open > 0 then return jsonb_build_object('ok', false, 'fout', 'onvolledig', 'open', v_open); end if;
  if exists (select 1 from public.inmeting_wijzigingen w where w.inmeting_id = i.id and w.status = 'voorgesteld') then
    return jsonb_build_object('ok', false, 'fout', 'akkoord_nodig');
  end if;
  update public.inmetingen set status = 'uitgevoerd', uitgevoerd_op = now(), gewijzigd = now() where id = i.id;
  return jsonb_build_object('ok', true);
end $$;

-- Het akkoord van de klant is bewijs: het kan niet meer worden gewijzigd en een inmeting met akkoord kan niet worden verwijderd.
create function public.inmeting_akkoord_onveranderlijk() returns trigger
  language plpgsql set search_path = ''
  as $$
begin
  if tg_table_name = 'inmeting_akkoorden' then
    raise exception 'Een akkoord van de klant kan niet worden gewijzigd' using errcode = '55000';
  end if;
  if old.status = 'akkoord' then
    raise exception 'Een goedgekeurde wijziging kan niet meer worden aangepast' using errcode = '55000';
  end if;
  return new;
end $$;
create trigger inmeting_akkoorden_onveranderlijk before update on public.inmeting_akkoorden
  for each row execute function public.inmeting_akkoord_onveranderlijk();
create trigger inmeting_wijzigingen_onveranderlijk before update on public.inmeting_wijzigingen
  for each row execute function public.inmeting_akkoord_onveranderlijk();

drop policy inmetingen_verwijderen on public.inmetingen;
create policy inmetingen_verwijderen on public.inmetingen for delete to authenticated
  using (
    public.heeft_rol(tenant_id, array['directie','verkoop','kantoor']::public.gebruikersrol[])
    and status <> 'uitgevoerd'
    and not exists (select 1 from public.inmeting_akkoorden a where a.inmeting_id = inmetingen.id)
  );

-- Bij annuleren vervallen de voorstellen waar de klant nog geen akkoord op heeft gegeven.
create function public.inmeting_annuleren_opruimen() returns trigger
  language plpgsql security definer set search_path = ''
  as $$
begin
  if new.status = 'geannuleerd' and old.status <> 'geannuleerd' then
    update public.inmeting_wijzigingen set status = 'vervallen' where inmeting_id = new.id and status = 'voorgesteld';
  end if;
  return new;
end $$;
create trigger inmetingen_annuleren_opruimen after update on public.inmetingen
  for each row execute function public.inmeting_annuleren_opruimen();
