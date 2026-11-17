-- Fase 3: een creditnota op een (deels) betaalde factuur, met terugbetaling. Voorheen kon je alleen crediteren wat nog openstond. Nu kan dat tot het nog niet gecrediteerde deel
-- van de factuur; wat de klant dan te veel heeft betaald, staat als "terug te betalen" open tot het is teruggestort en dat vastgelegd is (een terugbetaling staat vast, net als een betaling).
-- Terug te betalen = betaald + gecrediteerd - factuurbedrag, min wat al is teruggestort (nooit negatief). Een betaalde factuur kan nu ook volledig gecrediteerd worden (status gecrediteerd).

create table public.factuur_terugbetalingen (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants (id) on delete restrict,
  factuur_id  uuid not null references public.facturen (id) on delete restrict,
  bedrag      numeric(10, 2) not null check (bedrag > 0),
  betaald_op  date not null,
  notitie     text check (notitie is null or length(notitie) <= 500),
  door        uuid default auth.uid() references auth.users (id) on delete set null,
  aangemaakt  timestamptz not null default now()
);
create index factuur_terugbetalingen_factuur_idx on public.factuur_terugbetalingen (factuur_id);
create index factuur_terugbetalingen_tenant_idx on public.factuur_terugbetalingen (tenant_id);

alter table public.factuur_terugbetalingen enable row level security;
create policy factuur_terugbetalingen_lezen on public.factuur_terugbetalingen for select to authenticated
  using (public.heeft_rol(tenant_id, array['directie','kantoor','verkoop']::public.gebruikersrol[]));
revoke insert, update, delete, truncate on public.factuur_terugbetalingen from authenticated, anon;

-- Een terugbetaling staat vast (alleen "door" wordt leeg als die gebruiker verdwijnt) en verdwijnt nooit.
create function public.terugbetaling_vergrendelen() returns trigger
  language plpgsql set search_path = ''
  as $$
begin
  if tg_op = 'UPDATE' and old.door is not null and new.door is null and (to_jsonb(new) - 'door') = (to_jsonb(old) - 'door') then
    return new;
  end if;
  raise exception 'Een terugbetaling kan niet worden gewijzigd of verwijderd' using errcode = '55000';
end $$;
create trigger factuur_terugbetalingen_vergrendelen before update or delete on public.factuur_terugbetalingen
  for each row execute function public.terugbetaling_vergrendelen();
create trigger factuur_terugbetalingen_niet_legen before truncate on public.factuur_terugbetalingen
  for each statement execute function public.terugbetaling_vergrendelen();

-- Registreert een terugbetaling aan de klant (alleen directie en kantoor), hooguit het bedrag dat nog terug te betalen is.
create function public.registreer_terugbetaling(p_factuur uuid, p_bedrag numeric, p_datum date, p_notitie text) returns jsonb
  language plpgsql security definer set search_path = ''
  as $$
declare
  f public.facturen;
  v_betaald numeric(10, 2);
  v_terug numeric(10, 2);
  v_due numeric(10, 2);
  v_bedrag numeric(10, 2);
begin
  select * into f from public.facturen where id = p_factuur for update;
  if not found or not public.heeft_rol(f.tenant_id, array['directie','kantoor']::public.gebruikersrol[]) then
    return jsonb_build_object('ok', false, 'fout', 'geen_toegang');
  end if;
  v_bedrag := round(p_bedrag, 2);
  if p_bedrag is null or v_bedrag <= 0 or p_datum is null or p_datum < f.factuurdatum or p_datum > (now() at time zone 'Europe/Amsterdam')::date + 1 then
    return jsonb_build_object('ok', false, 'fout', 'ongeldig');
  end if;
  if exists (select 1 from public.factuur_terugbetalingen t where t.factuur_id = f.id and t.bedrag = v_bedrag and t.betaald_op = p_datum and t.aangemaakt > now() - interval '1 minute') then
    return jsonb_build_object('ok', false, 'fout', 'dubbel');
  end if;
  select coalesce(sum(bedrag), 0) into v_betaald from public.factuur_betalingen where factuur_id = f.id;
  select coalesce(sum(bedrag), 0) into v_terug from public.factuur_terugbetalingen where factuur_id = f.id;
  v_due := greatest(0, v_betaald + f.gecrediteerd - f.totaal_incl) - v_terug;
  if v_due <= 0 then return jsonb_build_object('ok', false, 'fout', 'niets_terug'); end if;
  if v_bedrag > v_due then return jsonb_build_object('ok', false, 'fout', 'te_veel'); end if;
  insert into public.factuur_terugbetalingen (tenant_id, factuur_id, bedrag, betaald_op, notitie)
    values (f.tenant_id, f.id, v_bedrag, p_datum, left(nullif(btrim(p_notitie), ''), 500));
  return jsonb_build_object('ok', true, 'nog_terug', v_due - v_bedrag);
end $$;
revoke all on function public.registreer_terugbetaling(uuid, numeric, date, text) from public, anon;
grant execute on function public.registreer_terugbetaling(uuid, numeric, date, text) to authenticated;

-- De bewaking van de factuur en het maken van een creditnota kennen nu ook een betaalde factuur.
create or replace function public.facturen_bewaken() returns trigger
  language plpgsql set search_path = ''
  as $$
declare
  v_bewerken boolean := coalesce(current_setting('kerncrm.factuur_bewerken', true), '') = 'on';
begin
  if (new.id, new.tenant_id, new.project_id, new.offerte_id, new.nummer, new.termijn, new.termijn_pct, new.factuurdatum, new.debiteur, new.aangemaakt)
     is distinct from
     (old.id, old.tenant_id, old.project_id, old.offerte_id, old.nummer, old.termijn, old.termijn_pct, old.factuurdatum, old.debiteur, old.aangemaakt)
     or (new.aangemaakt_door is distinct from old.aangemaakt_door and new.aangemaakt_door is not null) then
    raise exception 'Nummer, termijn, factuurdatum en klantgegevens van een factuur liggen vast' using errcode = '55000';
  end if;
  if old.verzonden_op is not null and new.verzonden_op is distinct from old.verzonden_op then
    raise exception 'Het moment van verzenden staat vast' using errcode = '55000';
  end if;
  if old.verzonden_op is null and new.verzonden_op is not null and (old.status <> 'open' or new.verzonden_op < now() - interval '1 minute' or new.verzonden_op > now() + interval '1 minute') then
    raise exception 'Alleen een open factuur kan nu als verzonden worden gemarkeerd' using errcode = '55000';
  end if;
  if (new.omschrijving, new.toelichting, new.vervaldatum, new.bedrag_excl, new.btw_hoog, new.btw_laag, new.totaal_incl, new.meerwerk)
     is distinct from
     (old.omschrijving, old.toelichting, old.vervaldatum, old.bedrag_excl, old.btw_hoog, old.btw_laag, old.totaal_incl, old.meerwerk) then
    if not v_bewerken or old.status <> 'open' then
      raise exception 'Een factuur kan alleen via de wijzigfunctie worden aangepast, en alleen zolang hij open staat' using errcode = '55000';
    end if;
  end if;
  if new.gecrediteerd is distinct from old.gecrediteerd and (not v_bewerken or old.status not in ('open', 'betaald') or new.gecrediteerd < old.gecrediteerd or new.gecrediteerd > new.totaal_incl) then
    raise exception 'Een creditnota kan alleen via de creditnotafunctie worden gemaakt' using errcode = '55000';
  end if;
  if new.status is distinct from old.status then
    if not (old.status = 'open' and new.status in ('betaald', 'geannuleerd', 'gecrediteerd')) and not (old.status = 'betaald' and new.status = 'gecrediteerd') then
      raise exception 'Deze statusovergang is niet toegestaan' using errcode = '55000';
    end if;
    if new.status = 'betaald' and ((select coalesce(sum(b.bedrag), 0) from public.factuur_betalingen b where b.factuur_id = new.id) + new.gecrediteerd < new.totaal_incl
       or new.gecrediteerd >= new.totaal_incl
       or not exists (select 1 from public.factuur_betalingen b where b.factuur_id = new.id)) then
      raise exception 'Een factuur is pas betaald als het hele bedrag is ontvangen' using errcode = '55000';
    end if;
    if new.status = 'geannuleerd' and length(btrim(coalesce(new.annulering_reden, ''))) = 0 then
      raise exception 'Vul een reden in om een factuur te annuleren' using errcode = '55000';
    end if;
    if new.status = 'gecrediteerd' and new.gecrediteerd <> new.totaal_incl then
      raise exception 'Een factuur is pas gecrediteerd als het hele bedrag is gecrediteerd' using errcode = '55000';
    end if;
    if new.status = 'geannuleerd' and (new.gecrediteerd > 0 or exists (select 1 from public.factuur_betalingen b where b.factuur_id = new.id)) then
      raise exception 'Een factuur met betalingen kan niet worden geannuleerd' using errcode = '55000';
    end if;
  end if;
  if new.annulering_reden is distinct from old.annulering_reden and not (old.status = 'open' and new.status = 'geannuleerd') then
    raise exception 'De reden van annuleren staat vast' using errcode = '55000';
  end if;
  return new;
end $$;

create or replace function public.maak_creditnota(
  p_factuur uuid, p_omschrijving text, p_excl numeric, p_hoog numeric, p_laag numeric, p_incl numeric, p_reden text
) returns jsonb
  language plpgsql security definer set search_path = ''
  as $$
declare
  f public.facturen;
  v_betaald numeric(10, 2);
  v_nieuw numeric(10, 2);
  v_nummer text;
  v_jaar integer := extract(year from now() at time zone 'Europe/Amsterdam')::integer;
  v_n integer;
  v_id uuid;
  v_status text;
  v_c_excl numeric(10, 2);
  v_c_hoog numeric(10, 2);
  v_c_laag numeric(10, 2);
begin
  perform 1 from public.offertes where id = (select x.offerte_id from public.facturen x where x.id = p_factuur) for update;
  select * into f from public.facturen where id = p_factuur for update;
  if not found or not public.heeft_rol(f.tenant_id, array['directie','kantoor']::public.gebruikersrol[]) then
    return jsonb_build_object('ok', false, 'fout', 'geen_toegang');
  end if;
  if not public.mag_prijzen_aanpassen(f.tenant_id) then return jsonb_build_object('ok', false, 'fout', 'geen_toestemming'); end if;
  if f.status not in ('open', 'betaald') then return jsonb_build_object('ok', false, 'fout', 'niet_open'); end if;
  if f.verzonden_op is null then return jsonb_build_object('ok', false, 'fout', 'niet_verzonden'); end if;
  if length(btrim(coalesce(p_reden, ''))) = 0 then return jsonb_build_object('ok', false, 'fout', 'reden'); end if;
  if length(btrim(coalesce(p_omschrijving, ''))) = 0
     or p_excl is null or p_hoog is null or p_laag is null or p_incl is null
     or p_excl < 0 or p_hoog < 0 or p_laag < 0 or p_incl <= 0 or p_incl > 10000000
     or round(p_excl + p_hoog + p_laag, 2) <> round(p_incl, 2)
     or p_hoog + p_laag > 0.21 * p_excl + 0.05 or p_hoog + p_laag < 0.09 * p_excl - 0.05 then
    return jsonb_build_object('ok', false, 'fout', 'ongeldig');
  end if;
  select coalesce(sum(bedrag), 0) into v_betaald from public.factuur_betalingen where factuur_id = f.id;
  -- Crediteren kan tot het nog niet gecrediteerde deel van de factuur, ook als er al (deels) is betaald: wat te veel is betaald, moet dan worden terugbetaald.
  if round(p_incl, 2) > f.totaal_incl - f.gecrediteerd then
    return jsonb_build_object('ok', false, 'fout', 'te_veel');
  end if;
  -- Per btw-component mag er niet meer worden gecrediteerd dan er is gefactureerd (voor de btw-aangifte).
  select coalesce(sum(bedrag_excl), 0), coalesce(sum(btw_hoog), 0), coalesce(sum(btw_laag), 0) into v_c_excl, v_c_hoog, v_c_laag
    from public.creditnotas where factuur_id = f.id;
  if v_c_excl + round(p_excl, 2) > f.bedrag_excl or v_c_hoog + round(p_hoog, 2) > f.btw_hoog or v_c_laag + round(p_laag, 2) > f.btw_laag then
    return jsonb_build_object('ok', false, 'fout', 'btw_te_veel');
  end if;
  -- Dubbele klik: dezelfde creditnota binnen een minuut.
  if exists (select 1 from public.creditnotas c where c.factuur_id = f.id and c.totaal_incl = round(p_incl, 2) and c.omschrijving = left(btrim(p_omschrijving), 300) and c.aangemaakt > now() - interval '1 minute') then
    return jsonb_build_object('ok', false, 'fout', 'dubbel');
  end if;
  -- Een factuur helemaal crediteren kan pas als er geen latere termijn meer loopt (anders ontstaat een gat in de volgorde).
  if f.gecrediteerd + round(p_incl, 2) = f.totaal_incl
     and exists (select 1 from public.facturen x where x.project_id = f.project_id and x.termijn > f.termijn and x.status not in ('geannuleerd', 'gecrediteerd')) then
    return jsonb_build_object('ok', false, 'fout', 'latere_termijn');
  end if;

  insert into public.nummerreeksen (tenant_id, soort, jaar, laatste) values (f.tenant_id, 'creditnota', v_jaar, 1)
    on conflict (tenant_id, soort, jaar) do update set laatste = public.nummerreeksen.laatste + 1
    returning laatste into v_n;
  v_nummer := 'CN-' || v_jaar::text || '-' || lpad(v_n::text, 4, '0');
  insert into public.creditnotas (tenant_id, factuur_id, project_id, nummer, datum, omschrijving, bedrag_excl, btw_hoog, btw_laag, totaal_incl, debiteur)
    values (f.tenant_id, f.id, f.project_id, v_nummer, (now() at time zone 'Europe/Amsterdam')::date, left(btrim(p_omschrijving), 300),
            round(p_excl, 2), round(p_hoog, 2), round(p_laag, 2), round(p_incl, 2), f.debiteur)
    returning id into v_id;

  v_nieuw := f.gecrediteerd + round(p_incl, 2);
  v_status := case when v_nieuw = f.totaal_incl then 'gecrediteerd'
                   when f.status = 'open' and v_betaald > 0 and v_nieuw + v_betaald >= f.totaal_incl then 'betaald'
                   else f.status end;
  perform set_config('kerncrm.factuur_bewerken', 'on', true);
  update public.facturen set gecrediteerd = v_nieuw, status = v_status where id = f.id;
  perform set_config('kerncrm.factuur_bewerken', 'off', true);
  insert into public.factuur_wijzigingen (tenant_id, factuur_id, oud, nieuw, reden)
    values (f.tenant_id, f.id, jsonb_build_object('gecrediteerd', f.gecrediteerd), jsonb_build_object('gecrediteerd', v_nieuw, 'creditnota', v_nummer), left(btrim(p_reden), 1000));
  return jsonb_build_object('ok', true, 'id', v_id, 'nummer', v_nummer, 'status', v_status, 'terug_te_betalen', greatest(0, v_betaald + v_nieuw - f.totaal_incl));
end $$;
