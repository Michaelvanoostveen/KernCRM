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
  check (soort <> 'configuratie' or (positie_id is not null and nieuwe_config is not null)),
  check (soort <> 'extra' or artikel_id is not null or status = 'vervallen')
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
    from public.inmeting_wijzigingen w where w.inmeting_id = p_inmeting and w.status <> 'vervallen'
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
  if p_config is null or jsonb_typeof(p_config) <> 'object' or p_meerprijs is null or abs(p_meerprijs) > 1000000
     or length(btrim(coalesce(p_omschrijving, ''))) = 0 then
    return jsonb_build_object('ok', false, 'fout', 'ongeldig');
  end if;
  update public.inmeting_wijzigingen set status = 'vervallen'
    where inmeting_id = i.id and positie_id = p_positie and soort = 'configuratie' and status = 'voorgesteld';
  insert into public.inmeting_wijzigingen (tenant_id, inmeting_id, positie_id, soort, nieuwe_config, omschrijving, meerprijs)
    values (i.tenant_id, i.id, p_positie, 'configuratie', p_config, left(btrim(p_omschrijving), 500), round(p_meerprijs, 2));
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
  select * into a from public.artikelen where id = p_artikel and tenant_id = i.tenant_id and actief;
  if not found then return jsonb_build_object('ok', false, 'fout', 'artikel'); end if;
  if p_positie is not null and not exists (select 1 from public.posities ps where ps.id = p_positie and ps.offerte_id = i.offerte_id and ps.tenant_id = i.tenant_id) then
    return jsonb_build_object('ok', false, 'fout', 'positie');
  end if;
  insert into public.inmeting_wijzigingen (tenant_id, inmeting_id, positie_id, soort, artikel_id, aantal, omschrijving, meerprijs)
    values (i.tenant_id, i.id, p_positie, 'extra', a.id, p_aantal, a.naam, round(a.verkoopprijs_incl * p_aantal, 2));
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.inmeting_voeg_extra_toe(uuid, uuid, uuid, integer) from public, anon;
grant execute on function public.inmeting_voeg_extra_toe(uuid, uuid, uuid, integer) to authenticated;

-- Haalt een voorstel weg zolang de klant er geen akkoord op heeft gegeven.
create function public.inmeting_verwijder_wijziging(p_inmeting uuid, p_wijziging uuid) returns jsonb
  language plpgsql security definer set search_path = ''
  as $$
begin
  if not public.inmeting_toegang(p_inmeting) then return jsonb_build_object('ok', false, 'fout', 'geen_toegang'); end if;
  update public.inmeting_wijzigingen set status = 'vervallen'
    where id = p_wijziging and inmeting_id = p_inmeting and status = 'voorgesteld'
      and exists (select 1 from public.inmetingen i where i.id = p_inmeting and i.status = 'gepland');
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.inmeting_verwijder_wijziging(uuid, uuid) from public, anon;
grant execute on function public.inmeting_verwijder_wijziging(uuid, uuid) to authenticated;

-- Legt het akkoord van de klant vast voor alle openstaande voorstellen.
create function public.inmeting_wijzigingen_akkoord(p_inmeting uuid, p_naam text, p_handtekening text, p_ip text, p_user_agent text) returns jsonb
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
  if length(btrim(coalesce(p_naam, ''))) < 3 then return jsonb_build_object('ok', false, 'fout', 'naam'); end if;
  if p_handtekening is null or length(p_handtekening) < 200 then return jsonb_build_object('ok', false, 'fout', 'handtekening'); end if;
  select coalesce(sum(meerprijs), 0) into v_totaal from public.inmeting_wijzigingen where inmeting_id = i.id and status = 'voorgesteld';
  if not exists (select 1 from public.inmeting_wijzigingen where inmeting_id = i.id and status = 'voorgesteld') then
    return jsonb_build_object('ok', false, 'fout', 'leeg');
  end if;
  insert into public.inmeting_akkoorden (tenant_id, inmeting_id, naam, handtekening, ip, user_agent, totaal_meerprijs)
    values (i.tenant_id, i.id, btrim(p_naam), p_handtekening, left(p_ip, 80), left(p_user_agent, 300), v_totaal)
    returning id into v_akkoord;
  update public.inmeting_wijzigingen set status = 'akkoord', akkoord_id = v_akkoord where inmeting_id = i.id and status = 'voorgesteld';
  return jsonb_build_object('ok', true, 'totaal', v_totaal);
end $$;
revoke all on function public.inmeting_wijzigingen_akkoord(uuid, text, text, text, text) from public, anon;
grant execute on function public.inmeting_wijzigingen_akkoord(uuid, text, text, text, text) to authenticated;

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
