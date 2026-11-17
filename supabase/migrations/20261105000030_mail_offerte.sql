-- Fase 3: de offerte vanuit het CRM mailen. Ook verkoop verstuurt offertes, dus de afzendergegevens en de verzendtoestemming moeten voor verkoop te lezen zijn zonder dat
-- verkoop de mailinstellingen of het logboek kan inzien of facturen kan mailen. De limiet per uur blijft gedeeld met de rest van de mail.

alter table public.mail_log add column offerte_id uuid references public.offertes (id) on delete restrict;
alter table public.mail_log drop constraint mail_log_soort_check;
alter table public.mail_log add constraint mail_log_soort_check check (soort in ('test', 'factuur', 'herinnering', 'betaalbevestiging', 'creditnota', 'offerte'));
create index mail_log_offerte_idx on public.mail_log (offerte_id) where offerte_id is not null;

-- De afzendergegevens voor het verzenden, voor wie offertes of facturen mailt (directie, kantoor en verkoop). Geeft alleen wat nodig is om te verzenden.
create function public.mail_afzender(p_tenant uuid) returns jsonb
  language plpgsql stable security definer set search_path = ''
  as $$
declare
  i public.mail_instellingen;
begin
  if p_tenant is null or not public.heeft_rol(p_tenant, array['directie','kantoor','verkoop']::public.gebruikersrol[]) then return null; end if;
  select * into i from public.mail_instellingen where tenant_id = p_tenant;
  if not found then return null; end if;
  return jsonb_build_object('provider', i.provider, 'actief', i.actief, 'naam', i.afzender_naam, 'adres', i.afzender_adres, 'antwoord', i.antwoord_adres,
    'domein_ok', exists (select 1 from public.mail_domeinen d where d.domein = split_part(i.afzender_adres, '@', 2) and d.tenant_id = p_tenant));
end $$;
revoke all on function public.mail_afzender(uuid) from public, anon;
grant execute on function public.mail_afzender(uuid) to authenticated;

-- Vraagt toestemming om een offerte te mailen (directie, kantoor of verkoop) en telt de mail meteen mee in de limiet van 60 per klokuur.
create function public.mail_mag_versturen_offerte(p_tenant uuid) returns jsonb
  language plpgsql security definer set search_path = ''
  as $$
declare
  v_uur timestamptz := date_trunc('hour', now());
  v_aantal integer;
begin
  if p_tenant is null or not public.heeft_rol(p_tenant, array['directie','kantoor','verkoop']::public.gebruikersrol[]) then
    return jsonb_build_object('ok', false, 'fout', 'geen_toegang');
  end if;
  if not exists (
    select 1 from public.mail_instellingen i join public.mail_domeinen d on d.domein = split_part(i.afzender_adres, '@', 2) and d.tenant_id = i.tenant_id
    where i.tenant_id = p_tenant
  ) then
    return jsonb_build_object('ok', false, 'fout', 'domein_niet_vrijgegeven');
  end if;
  delete from public.mail_teller where tenant_id = p_tenant and uur < now() - interval '2 days';
  insert into public.mail_teller as t (tenant_id, uur, aantal) values (p_tenant, v_uur, 1)
    on conflict (tenant_id, uur) do update set aantal = t.aantal + 1 where t.aantal < 60
    returning aantal into v_aantal;
  if v_aantal is null then return jsonb_build_object('ok', false, 'fout', 'limiet'); end if;
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.mail_mag_versturen_offerte(uuid) from public, anon;
grant execute on function public.mail_mag_versturen_offerte(uuid) to authenticated;

-- Legt een verzonden of mislukte offertemail vast in het logboek.
create function public.mail_log_offerte_toevoegen(p_tenant uuid, p_offerte uuid, p_aan text, p_onderwerp text, p_status text, p_extern_id text, p_fout text) returns jsonb
  language plpgsql security definer set search_path = ''
  as $$
begin
  if p_tenant is null or not public.heeft_rol(p_tenant, array['directie','kantoor','verkoop']::public.gebruikersrol[]) then
    return jsonb_build_object('ok', false, 'fout', 'geen_toegang');
  end if;
  if p_status is null or p_status not in ('verzonden', 'mislukt') or length(btrim(coalesce(p_aan, ''))) = 0
     or not exists (select 1 from public.offertes o where o.id = p_offerte and o.tenant_id = p_tenant) then
    return jsonb_build_object('ok', false, 'fout', 'ongeldig');
  end if;
  insert into public.mail_log (tenant_id, soort, offerte_id, aan, onderwerp, status, extern_id, fout)
    values (p_tenant, 'offerte', p_offerte, left(btrim(p_aan), 200), left(coalesce(p_onderwerp, ''), 300), p_status,
            left(nullif(btrim(coalesce(p_extern_id, '')), ''), 100), left(nullif(btrim(coalesce(p_fout, '')), ''), 1000));
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.mail_log_offerte_toevoegen(uuid, uuid, text, text, text, text, text) from public, anon;
grant execute on function public.mail_log_offerte_toevoegen(uuid, uuid, text, text, text, text, text) to authenticated;
