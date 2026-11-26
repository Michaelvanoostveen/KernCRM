-- Fase 3: meldingen in het CRM, om te beginnen "de klant heeft de offerte geopend" en "de klant heeft de offerte getekend". Een melding gaat naar de verkoper van het project
-- (de maker; is die er niet meer, dan naar directie en kantoor) en bij een getekende offerte ook naar directie en kantoor, zodat de planning het meteen weet.
-- Alleen de eerste keer openen geeft een melding (niet elke keer dat de klant de pagina ververst). Meldingen worden door de database zelf gemaakt, op het moment dat de gebeurtenis
-- wordt vastgelegd; een gebruiker ziet alleen zijn eigen meldingen en kan ze alleen als gelezen markeren.

create table public.meldingen (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  soort       text not null check (soort in ('offerte_geopend', 'offerte_akkoord')),
  project_id  uuid references public.projecten (id) on delete cascade,
  offerte_id  uuid references public.offertes (id) on delete cascade,
  tekst       text not null check (length(tekst) <= 300),
  aangemaakt  timestamptz not null default now(),
  gelezen_op  timestamptz
);
create index meldingen_gebruiker_idx on public.meldingen (user_id, aangemaakt desc);
create index meldingen_ongelezen_idx on public.meldingen (user_id) where gelezen_op is null;
create index meldingen_tenant_idx on public.meldingen (tenant_id);

alter table public.meldingen enable row level security;
create policy meldingen_lezen on public.meldingen for select to authenticated
  using (user_id = auth.uid() and exists (select 1 from public.tenant_leden m where m.tenant_id = meldingen.tenant_id and m.user_id = auth.uid()));
revoke insert, update, delete, truncate on public.meldingen from authenticated, anon;

-- Markeert eigen meldingen als gelezen: de opgegeven meldingen, of alle ongelezen als er niets wordt opgegeven.
create function public.meldingen_gelezen(p_ids uuid[]) returns integer
  language plpgsql security definer set search_path = ''
  as $$
declare
  v_aantal integer;
begin
  if auth.uid() is null then return 0; end if;
  update public.meldingen set gelezen_op = now()
    where user_id = auth.uid() and gelezen_op is null and (p_ids is null or id = any (p_ids));
  get diagnostics v_aantal = row_count;
  return v_aantal;
end $$;
revoke all on function public.meldingen_gelezen(uuid[]) from public, anon;
grant execute on function public.meldingen_gelezen(uuid[]) to authenticated;

-- Maakt de meldingen bij een nieuwe gebeurtenis op een offerte (het openen of tekenen door de klant).
create function public.melding_bij_offertegebeurtenis() returns trigger
  language plpgsql security definer set search_path = ''
  as $$
declare
  p public.projecten;
  k public.klanten;
  v_tekst text;
  v_soort text;
  r record;
begin
  if new.soort not in ('geopend', 'akkoord') then return new; end if;
  -- Alleen de eerste keer openen telt; het slot voorkomt dat twee gelijktijdige eerste keren allebei een melding maken.
  perform pg_advisory_xact_lock(hashtext(new.offerte_id::text));
  if new.soort = 'geopend' and exists (select 1 from public.offerte_gebeurtenissen g where g.offerte_id = new.offerte_id and g.soort = 'geopend' and g.id <> new.id) then
    return new;
  end if;
  select pr.* into p from public.projecten pr join public.offertes o on o.project_id = pr.id where o.id = new.offerte_id and o.tenant_id = new.tenant_id and pr.tenant_id = new.tenant_id;
  if not found then return new; end if;
  select * into k from public.klanten where id = p.klant_id and tenant_id = new.tenant_id;
  v_soort := case new.soort when 'geopend' then 'offerte_geopend' else 'offerte_akkoord' end;
  v_tekst := left(coalesce(k.naam, 'De klant') || ' heeft de offerte voor ' || p.nummer || ' ' || p.naam
             || case new.soort when 'geopend' then ' geopend.' else ' ondertekend: akkoord.' end, 300);
  begin
  for r in
    select distinct u.user_id from (
      select p.verkoper_id as user_id where p.verkoper_id is not null
      union
      select tl.user_id from public.tenant_leden tl where tl.tenant_id = new.tenant_id and tl.rol in ('directie', 'kantoor')
        and (new.soort = 'akkoord' or p.verkoper_id is null or not exists (select 1 from public.tenant_leden v where v.tenant_id = new.tenant_id and v.user_id = p.verkoper_id and v.rol in ('directie', 'kantoor', 'verkoop')))
    ) u
    where exists (select 1 from public.tenant_leden m where m.tenant_id = new.tenant_id and m.user_id = u.user_id and m.rol in ('directie', 'kantoor', 'verkoop'))
  loop
    insert into public.meldingen (tenant_id, user_id, soort, project_id, offerte_id, tekst) values (new.tenant_id, r.user_id, v_soort, p.id, new.offerte_id, v_tekst);
  end loop;
  exception when others then
    -- Een melding mag het vastleggen van de gebeurtenis nooit laten mislukken.
    raise warning 'melding maken mislukt: %', sqlerrm;
  end;
  return new;
end $$;
revoke all on function public.melding_bij_offertegebeurtenis() from public, anon, authenticated;
create trigger offerte_gebeurtenissen_meldingen after insert on public.offerte_gebeurtenissen
  for each row execute function public.melding_bij_offertegebeurtenis();
