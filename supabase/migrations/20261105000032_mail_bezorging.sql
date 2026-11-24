-- Fase 3: de bezorgstatus van verzonden mail terug in het CRM (bezorgd, vertraagd, teruggekaatst, spamklacht), via de meldingen (webhook) van Resend.
-- De melding komt binnen bij een openbare route van de app die niets anders doet dan hem doorgeven aan de functie hieronder. De functie controleert zelf de
-- handtekening van Resend (Svix: HMAC-SHA256 over id, tijdstip en inhoud) met een geheim dat alleen in de database staat; zonder geldige handtekening gebeurt er niets.
-- Elke melding wordt maar één keer verwerkt en alleen als ze bij een mail uit het logboek hoort. Er is geen serversleutel met brede rechten voor nodig.

create extension if not exists pgcrypto with schema extensions;

-- Het ondertekeningsgeheim van de webhook (begint met whsec_). Eén rij; niemand kan het lezen of schrijven behalve de beheerder via SQL.
create table public.mail_webhook_geheim (
  id     integer primary key default 1 check (id = 1),
  geheim text not null check (length(geheim) between 16 and 200)
);
alter table public.mail_webhook_geheim enable row level security;
revoke all on public.mail_webhook_geheim from authenticated, anon;

create table public.mail_events (
  id          uuid primary key default gen_random_uuid(),
  svix_id     text not null unique,
  tenant_id   uuid not null references public.tenants (id) on delete cascade,
  mail_log_id uuid not null references public.mail_log (id) on delete restrict,
  extern_id   text not null,
  soort       text not null check (soort in ('verzonden', 'bezorgd', 'vertraagd', 'teruggekaatst', 'klacht', 'mislukt', 'geblokkeerd')),
  detail      text check (detail is null or length(detail) <= 300),
  opgetreden  timestamptz not null,
  aangemaakt  timestamptz not null default now()
);
create index mail_events_log_idx on public.mail_events (mail_log_id);
create index mail_events_tenant_idx on public.mail_events (tenant_id, opgetreden desc);

alter table public.mail_events enable row level security;
create policy mail_events_lezen on public.mail_events for select to authenticated
  using (public.heeft_rol(tenant_id, array['directie','kantoor']::public.gebruikersrol[]));
revoke insert, update, delete, truncate on public.mail_events from authenticated, anon;

-- Een gebeurtenis staat vast.
create function public.mail_events_vergrendelen() returns trigger
  language plpgsql set search_path = ''
  as $$
begin
  raise exception 'Een bezorgmelding kan niet worden gewijzigd of verwijderd' using errcode = '55000';
end $$;
create trigger mail_events_vergrendelen before update or delete on public.mail_events
  for each row execute function public.mail_events_vergrendelen();
create trigger mail_events_niet_legen before truncate on public.mail_events
  for each statement execute function public.mail_events_vergrendelen();

-- Verwerkt een melding van Resend. Aanroepbaar zonder inloggen (de melding komt van Resend), maar alleen met een geldige handtekening.
create function public.mail_webhook_verwerk(p_body text, p_svix_id text, p_svix_timestamp text, p_svix_signature text) returns jsonb
  language plpgsql security definer set search_path = ''
  as $$
declare
  v_geheim text;
  v_sleutel bytea;
  v_verwacht text;
  v_ok boolean := false;
  v_deel text;
  v_ts bigint;
  j jsonb;
  v_type text;
  v_soort text;
  v_extern text;
  l public.mail_log;
  v_tijd timestamptz;
  v_detail text;
begin
  select geheim into v_geheim from public.mail_webhook_geheim where id = 1;
  if v_geheim is null then return jsonb_build_object('ok', false, 'fout', 'niet_ingesteld'); end if;
  if p_body is null or length(p_body) > 100000 or p_svix_id is null or length(p_svix_id) > 200 or p_svix_timestamp !~ '^[0-9]{1,12}$' or p_svix_signature is null or length(p_svix_signature) > 2000 then
    return jsonb_build_object('ok', false, 'fout', 'ongeldig');
  end if;
  v_ts := p_svix_timestamp::bigint;
  -- Een melding die te oud of te nieuw is, hoort niet (tegen het opnieuw afspelen van een afgeluisterde melding).
  if abs(extract(epoch from now())::bigint - v_ts) > 300 then return jsonb_build_object('ok', false, 'fout', 'verlopen'); end if;

  v_sleutel := decode(regexp_replace(v_geheim, '^whsec_', ''), 'base64');
  v_verwacht := encode(extensions.hmac(convert_to(p_svix_id || '.' || p_svix_timestamp || '.' || p_body, 'UTF8'), v_sleutel, 'sha256'), 'base64');
  -- De kop kan meerdere handtekeningen bevatten, gescheiden door een spatie: "v1,<base64> v1,<base64>". Vergelijken via een tweede HMAC, zodat de duur niet verklapt waar het verschil zit.
  foreach v_deel in array regexp_split_to_array(btrim(p_svix_signature), '\s+') loop
    if v_deel like 'v1,%' and extensions.hmac(convert_to(substr(v_deel, 4), 'UTF8'), v_sleutel, 'sha256') = extensions.hmac(convert_to(v_verwacht, 'UTF8'), v_sleutel, 'sha256') then
      v_ok := true;
    end if;
  end loop;
  if not v_ok then return jsonb_build_object('ok', false, 'fout', 'handtekening'); end if;

  begin
    j := p_body::jsonb;
  exception when others then
    return jsonb_build_object('ok', false, 'fout', 'ongeldig');
  end;
  v_type := j ->> 'type';
  v_soort := case v_type
    when 'email.sent' then 'verzonden' when 'email.delivered' then 'bezorgd' when 'email.delivery_delayed' then 'vertraagd'
    when 'email.bounced' then 'teruggekaatst' when 'email.complained' then 'klacht' when 'email.failed' then 'mislukt' when 'email.suppressed' then 'geblokkeerd'
    else null end;
  if v_soort is null then return jsonb_build_object('ok', true, 'genegeerd', 'type'); end if;
  v_extern := j #>> '{data,email_id}';
  if v_extern is null then return jsonb_build_object('ok', true, 'genegeerd', 'geen_mail'); end if;
  select * into l from public.mail_log where extern_id = v_extern order by aangemaakt desc limit 1;
  if not found then return jsonb_build_object('ok', true, 'genegeerd', 'onbekende_mail'); end if;

  begin
    v_tijd := coalesce((j ->> 'created_at')::timestamptz, now());
  exception when others then
    v_tijd := now();
  end;
  v_detail := left(coalesce(j #>> '{data,bounce,message}', j #>> '{data,failed,reason}', j #>> '{data,suppressed,message}', j #>> '{data,reason}'), 300);
  insert into public.mail_events (svix_id, tenant_id, mail_log_id, extern_id, soort, detail, opgetreden)
    values (left(p_svix_id, 200), l.tenant_id, l.id, v_extern, v_soort, v_detail, v_tijd)
    on conflict (svix_id) do nothing;
  return jsonb_build_object('ok', true, 'soort', v_soort);
end $$;
revoke all on function public.mail_webhook_verwerk(text, text, text, text) from public;
grant execute on function public.mail_webhook_verwerk(text, text, text, text) to anon, authenticated;
