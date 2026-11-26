-- Fase 3: een melding ook per e-mail. De Next-app verstuurt de mail met een service-role-sleutel (nooit in de browser); de database bewaakt dat elke melding hooguit één keer
-- gemaild wordt, dat alleen een actief, vrijgegeven afzenderdomein gebruikt wordt, en dat een gebruiker de mail zelf kan uitzetten (voorkeur 'melding_mail' = false).

alter table public.meldingen add column mail_verstuurd_op timestamptz;
alter table public.mail_log drop constraint mail_log_soort_check;
alter table public.mail_log add constraint mail_log_soort_check check (soort in ('test', 'factuur', 'herinnering', 'betaalbevestiging', 'creditnota', 'offerte', 'melding'));

-- Zet de te mailen meldingen van één offerte (via de publieke link) klaar en markeert ze meteen als verwerkt, zodat een tweede aanroep niets meer oplevert.
create function public.melding_mail_klaarzetten(p_token text, p_soort text) returns jsonb
  language plpgsql security definer set search_path = ''
  as $$
declare
  v_offerte public.offertes;
  i public.mail_instellingen;
  v_tekst text;
  v_project uuid;
  v_ontvangers jsonb;
begin
  if p_soort is null or p_soort not in ('offerte_geopend', 'offerte_akkoord') or p_token is null then return jsonb_build_object('ontvangers', '[]'::jsonb); end if;
  select * into v_offerte from public.offertes where publiek_token = p_token;
  if not found then return jsonb_build_object('ontvangers', '[]'::jsonb); end if;
  select * into i from public.mail_instellingen where tenant_id = v_offerte.tenant_id;
  if not found or not i.actief or i.provider = 'geen' or i.afzender_adres is null or i.afzender_naam is null
     or not exists (select 1 from public.mail_domeinen d where d.tenant_id = i.tenant_id and d.domein = split_part(i.afzender_adres, '@', 2)) then
    return jsonb_build_object('ontvangers', '[]'::jsonb);
  end if;

  with verwerkt as (
    update public.meldingen m set mail_verstuurd_op = now()
      where m.offerte_id = v_offerte.id and m.tenant_id = v_offerte.tenant_id and m.soort = p_soort and m.mail_verstuurd_op is null
      returning m.user_id, m.tekst, m.project_id
  )
  select max(v.tekst), max(v.project_id::text)::uuid, coalesce(jsonb_agg(v.user_id), '[]'::jsonb)
    into v_tekst, v_project, v_ontvangers
    from verwerkt v
    where exists (select 1 from public.tenant_leden tl where tl.tenant_id = v_offerte.tenant_id and tl.user_id = v.user_id and tl.rol in ('directie', 'kantoor', 'verkoop'))
      and not exists (select 1 from public.gebruiker_voorkeuren gv where gv.user_id = v.user_id and gv.tenant_id = v_offerte.tenant_id and gv.sleutel = 'melding_mail' and gv.waarde = 'false'::jsonb);

  return jsonb_build_object('tenant_id', v_offerte.tenant_id, 'offerte_id', v_offerte.id, 'project_id', v_project, 'tekst', v_tekst, 'ontvangers', coalesce(v_ontvangers, '[]'::jsonb),
    'afzender', jsonb_build_object('provider', i.provider, 'naam', i.afzender_naam, 'adres', i.afzender_adres, 'antwoord', i.antwoord_adres));
end $$;
revoke all on function public.melding_mail_klaarzetten(text, text) from public, anon, authenticated;
grant execute on function public.melding_mail_klaarzetten(text, text) to service_role;

-- Legt een verzonden of mislukte meldingsmail vast in het mail-logboek.
create function public.melding_mail_log(p_tenant uuid, p_offerte uuid, p_aan text, p_onderwerp text, p_status text, p_extern_id text, p_fout text) returns void
  language plpgsql security definer set search_path = ''
  as $$
begin
  if p_status is null or p_status not in ('verzonden', 'mislukt') or length(btrim(coalesce(p_aan, ''))) = 0
     or not exists (select 1 from public.offertes o where o.id = p_offerte and o.tenant_id = p_tenant) then
    return;
  end if;
  insert into public.mail_log (tenant_id, soort, offerte_id, aan, onderwerp, status, extern_id, fout)
    values (p_tenant, 'melding', p_offerte, left(btrim(p_aan), 200), left(coalesce(p_onderwerp, ''), 300), p_status,
            left(nullif(btrim(coalesce(p_extern_id, '')), ''), 100), left(nullif(btrim(coalesce(p_fout, '')), ''), 1000));
end $$;
revoke all on function public.melding_mail_log(uuid, uuid, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.melding_mail_log(uuid, uuid, text, text, text, text, text) to service_role;
