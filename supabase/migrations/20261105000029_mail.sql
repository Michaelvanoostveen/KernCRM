-- Fase 3: e-mail versturen vanuit het CRM via een bezorgdienst (nu Resend). Eén platformaccount; elk bedrijf heeft zijn eigen afzenderadres op een eigen,
-- geverifieerd domein. Een bedrijf kan alleen verzenden vanaf een domein dat voor dat bedrijf is vrijgegeven (tabel mail_domeinen, beheerd door de
-- platformbeheerder), zodat het ene bedrijf nooit uit naam van het domein van een ander kan mailen. De API-sleutel staat niet in de database maar als geheim op de server.
-- Elke verzonden (of mislukte) mail komt in een logboek dat niet te wijzigen is.

create table public.mail_domeinen (
  domein     text primary key check (domein = lower(domein) and domein ~ '^[a-z0-9]([a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$'),
  tenant_id  uuid not null references public.tenants (id) on delete cascade,
  aangemaakt timestamptz not null default now()
);
create index mail_domeinen_tenant_idx on public.mail_domeinen (tenant_id);

create table public.mail_instellingen (
  tenant_id      uuid primary key references public.tenants (id) on delete cascade,
  provider       text not null default 'geen' check (provider in ('geen', 'resend')),
  actief         boolean not null default false,
  afzender_naam  text check (afzender_naam is null or (length(btrim(afzender_naam)) between 1 and 80 and afzender_naam !~ '[\r\n<>",;]')),
  afzender_adres text check (afzender_adres is null or (afzender_adres = lower(afzender_adres) and afzender_adres ~ '^[a-z0-9._+-]+@[a-z0-9]([a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$' and length(afzender_adres) <= 120)),
  antwoord_adres text check (antwoord_adres is null or (antwoord_adres = lower(antwoord_adres) and antwoord_adres ~ '^[a-z0-9._+-]+@[a-z0-9]([a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$' and length(antwoord_adres) <= 120)),
  gewijzigd      timestamptz not null default now(),
  gewijzigd_door uuid default auth.uid() references auth.users (id) on delete set null,
  check (not actief or (provider <> 'geen' and afzender_adres is not null and afzender_naam is not null))
);

create table public.mail_log (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants (id) on delete cascade,
  soort         text not null check (soort in ('test', 'factuur', 'herinnering', 'betaalbevestiging', 'creditnota')),
  factuur_id    uuid references public.facturen (id) on delete restrict,
  creditnota_id uuid references public.creditnotas (id) on delete restrict,
  aan           text not null check (length(aan) <= 200),
  onderwerp     text not null check (length(onderwerp) <= 300),
  status        text not null check (status in ('verzonden', 'mislukt')),
  extern_id     text check (extern_id is null or length(extern_id) <= 100),
  fout          text check (fout is null or length(fout) <= 1000),
  door          uuid default auth.uid() references auth.users (id) on delete set null,
  aangemaakt    timestamptz not null default now()
);
create index mail_log_tenant_idx on public.mail_log (tenant_id, aangemaakt desc);
create index mail_log_factuur_idx on public.mail_log (factuur_id) where factuur_id is not null;
create index mail_log_creditnota_idx on public.mail_log (creditnota_id) where creditnota_id is not null;

alter table public.mail_domeinen enable row level security;
alter table public.mail_instellingen enable row level security;
alter table public.mail_log enable row level security;
create policy mail_domeinen_lezen on public.mail_domeinen for select to authenticated
  using (public.heeft_rol(tenant_id, array['directie','kantoor']::public.gebruikersrol[]));
create policy mail_instellingen_lezen on public.mail_instellingen for select to authenticated
  using (public.heeft_rol(tenant_id, array['directie','kantoor']::public.gebruikersrol[]));
create policy mail_log_lezen on public.mail_log for select to authenticated
  using (public.heeft_rol(tenant_id, array['directie','kantoor']::public.gebruikersrol[]));
revoke insert, update, delete, truncate on public.mail_domeinen, public.mail_instellingen, public.mail_log from authenticated, anon;

-- Het logboek van verzonden mail staat vast (alleen "door" wordt leeg als die gebruiker verdwijnt).
create function public.mail_log_vergrendelen() returns trigger
  language plpgsql set search_path = ''
  as $$
begin
  if tg_op = 'UPDATE' and old.door is not null and new.door is null and (to_jsonb(new) - 'door') = (to_jsonb(old) - 'door') then
    return new;
  end if;
  raise exception 'Het logboek van verzonden mail kan niet worden gewijzigd of verwijderd' using errcode = '55000';
end $$;
create trigger mail_log_vergrendelen before update or delete on public.mail_log
  for each row execute function public.mail_log_vergrendelen();
create trigger mail_log_niet_legen before truncate on public.mail_log
  for each statement execute function public.mail_log_vergrendelen();

-- Bewaart de mailinstellingen van het bedrijf (alleen de directie). Het afzenderadres moet op een voor dit bedrijf vrijgegeven domein staan.
create function public.mail_instellingen_bewaar(p_tenant uuid, p_provider text, p_actief boolean, p_naam text, p_afzender text, p_antwoord text) returns jsonb
  language plpgsql security definer set search_path = ''
  as $$
declare
  v_afzender text := lower(btrim(coalesce(p_afzender, '')));
  v_antwoord text := lower(btrim(coalesce(p_antwoord, '')));
  v_naam text := btrim(coalesce(p_naam, ''));
  v_domein text;
begin
  if p_tenant is null or not public.heeft_rol(p_tenant, array['directie']::public.gebruikersrol[]) then
    return jsonb_build_object('ok', false, 'fout', 'geen_toegang');
  end if;
  if p_provider is null or p_provider not in ('geen', 'resend') then return jsonb_build_object('ok', false, 'fout', 'ongeldig'); end if;
  if v_naam !~ '^[^\r\n<>",;]{1,80}$' and v_naam <> '' then return jsonb_build_object('ok', false, 'fout', 'ongeldig'); end if;
  if v_afzender <> '' and v_afzender !~ '^[a-z0-9._+-]+@[a-z0-9]([a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$' then return jsonb_build_object('ok', false, 'fout', 'ongeldig'); end if;
  if v_antwoord <> '' and v_antwoord !~ '^[a-z0-9._+-]+@[a-z0-9]([a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$' then return jsonb_build_object('ok', false, 'fout', 'ongeldig'); end if;
  if p_provider = 'resend' and v_afzender <> '' then
    v_domein := split_part(v_afzender, '@', 2);
    if not exists (select 1 from public.mail_domeinen d where d.domein = v_domein and d.tenant_id = p_tenant) then
      return jsonb_build_object('ok', false, 'fout', 'domein_niet_vrijgegeven');
    end if;
  end if;
  if coalesce(p_actief, false) and (p_provider = 'geen' or v_afzender = '' or v_naam = '') then return jsonb_build_object('ok', false, 'fout', 'onvolledig'); end if;
  insert into public.mail_instellingen (tenant_id, provider, actief, afzender_naam, afzender_adres, antwoord_adres)
    values (p_tenant, p_provider, coalesce(p_actief, false), nullif(v_naam, ''), nullif(v_afzender, ''), nullif(v_antwoord, ''))
    on conflict (tenant_id) do update set provider = excluded.provider, actief = excluded.actief, afzender_naam = excluded.afzender_naam,
      afzender_adres = excluded.afzender_adres, antwoord_adres = excluded.antwoord_adres, gewijzigd = now(), gewijzigd_door = auth.uid();
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.mail_instellingen_bewaar(uuid, text, boolean, text, text, text) from public, anon;
grant execute on function public.mail_instellingen_bewaar(uuid, text, boolean, text, text, text) to authenticated;

-- Mag er nu een mail worden verstuurd? Directie of kantoor, en hooguit 60 mails per uur per bedrijf (tegen misbruik en een uit de hand gelopen reeks).
create function public.mail_mag_versturen(p_tenant uuid) returns jsonb
  language plpgsql stable security definer set search_path = ''
  as $$
begin
  if p_tenant is null or not public.heeft_rol(p_tenant, array['directie','kantoor']::public.gebruikersrol[]) then
    return jsonb_build_object('ok', false, 'fout', 'geen_toegang');
  end if;
  if (select count(*) from public.mail_log l where l.tenant_id = p_tenant and l.aangemaakt > now() - interval '1 hour') >= 60 then
    return jsonb_build_object('ok', false, 'fout', 'limiet');
  end if;
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.mail_mag_versturen(uuid) from public, anon;
grant execute on function public.mail_mag_versturen(uuid) to authenticated;

-- Legt een verzonden of mislukte mail vast in het logboek.
create function public.mail_log_toevoegen(p_tenant uuid, p_soort text, p_factuur uuid, p_creditnota uuid, p_aan text, p_onderwerp text, p_status text, p_extern_id text, p_fout text) returns jsonb
  language plpgsql security definer set search_path = ''
  as $$
begin
  if p_tenant is null or not public.heeft_rol(p_tenant, array['directie','kantoor']::public.gebruikersrol[]) then
    return jsonb_build_object('ok', false, 'fout', 'geen_toegang');
  end if;
  if p_soort is null or p_soort not in ('test', 'factuur', 'herinnering', 'betaalbevestiging', 'creditnota') or p_status is null or p_status not in ('verzonden', 'mislukt')
     or length(btrim(coalesce(p_aan, ''))) = 0 then
    return jsonb_build_object('ok', false, 'fout', 'ongeldig');
  end if;
  if p_factuur is not null and not exists (select 1 from public.facturen f where f.id = p_factuur and f.tenant_id = p_tenant) then
    return jsonb_build_object('ok', false, 'fout', 'ongeldig');
  end if;
  if p_creditnota is not null and not exists (select 1 from public.creditnotas c where c.id = p_creditnota and c.tenant_id = p_tenant) then
    return jsonb_build_object('ok', false, 'fout', 'ongeldig');
  end if;
  insert into public.mail_log (tenant_id, soort, factuur_id, creditnota_id, aan, onderwerp, status, extern_id, fout)
    values (p_tenant, p_soort, p_factuur, p_creditnota, left(btrim(p_aan), 200), left(coalesce(p_onderwerp, ''), 300), p_status,
            left(nullif(btrim(coalesce(p_extern_id, '')), ''), 100), left(nullif(btrim(coalesce(p_fout, '')), ''), 1000));
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.mail_log_toevoegen(uuid, text, uuid, uuid, text, text, text, text, text) from public, anon;
grant execute on function public.mail_log_toevoegen(uuid, text, uuid, uuid, text, text, text, text, text) to authenticated;
