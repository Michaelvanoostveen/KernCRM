-- Fase 2, stap 1b: aanscherping van de inmeting na de migratiecontrole.
-- - De inmeter moet lid zijn van hetzelfde bedrijf, ook nadat hij is toegewezen.
-- - Een positie moet bij de offerte van de inmeting horen.
-- - De status 'uitgevoerd' zet je alleen via inmeting_afronden; een afgeronde inmeting is vergrendeld.
-- - Per project is er één geplande inmeting tegelijk.

create index inmeting_regels_tenant_idx on public.inmeting_regels (tenant_id);
create unique index inmetingen_een_geplande_per_project on public.inmetingen (project_id) where status = 'gepland';

create function public.is_lid(p_tenant uuid, p_user uuid) returns boolean
  language sql stable security definer set search_path = ''
  as $$ select exists (select 1 from public.tenant_leden l where l.tenant_id = p_tenant and l.user_id = p_user) $$;
revoke all on function public.is_lid(uuid, uuid) from public, anon;
grant execute on function public.is_lid(uuid, uuid) to authenticated;

drop policy inmetingen_beheren on public.inmetingen;
drop policy inmeting_regels_beheren on public.inmeting_regels;

create policy inmetingen_lezen on public.inmetingen for select to authenticated
  using (public.heeft_rol(tenant_id, array['directie','verkoop','kantoor']::public.gebruikersrol[]));
create policy inmetingen_plannen on public.inmetingen for insert to authenticated
  with check (
    public.heeft_rol(tenant_id, array['directie','verkoop','kantoor']::public.gebruikersrol[])
    and status = 'gepland'
    and (inmeter_id is null or public.is_lid(tenant_id, inmeter_id))
    and exists (select 1 from public.offertes o where o.id = offerte_id and o.project_id = inmetingen.project_id and o.tenant_id = inmetingen.tenant_id and o.status = 'akkoord')
  );
-- Alleen een geplande inmeting is te wijzigen; afronden gaat uitsluitend via inmeting_afronden.
create policy inmetingen_wijzigen on public.inmetingen for update to authenticated
  using (public.heeft_rol(tenant_id, array['directie','verkoop','kantoor']::public.gebruikersrol[]) and status = 'gepland')
  with check (
    public.heeft_rol(tenant_id, array['directie','verkoop','kantoor']::public.gebruikersrol[])
    and status in ('gepland', 'geannuleerd')
    and (inmeter_id is null or public.is_lid(tenant_id, inmeter_id))
  );
create policy inmetingen_verwijderen on public.inmetingen for delete to authenticated
  using (public.heeft_rol(tenant_id, array['directie','verkoop','kantoor']::public.gebruikersrol[]) and status <> 'uitgevoerd');

create policy inmeting_regels_lezen on public.inmeting_regels for select to authenticated
  using (public.heeft_rol(tenant_id, array['directie','verkoop','kantoor']::public.gebruikersrol[]));
create policy inmeting_regels_schrijven on public.inmeting_regels for insert to authenticated
  with check (
    public.heeft_rol(tenant_id, array['directie','verkoop','kantoor']::public.gebruikersrol[])
    and exists (
      select 1 from public.inmetingen i
      join public.posities ps on ps.offerte_id = i.offerte_id and ps.id = inmeting_regels.positie_id and ps.tenant_id = i.tenant_id
      where i.id = inmeting_regels.inmeting_id and i.tenant_id = inmeting_regels.tenant_id and i.status = 'gepland')
  );
create policy inmeting_regels_wijzigen on public.inmeting_regels for update to authenticated
  using (public.heeft_rol(tenant_id, array['directie','verkoop','kantoor']::public.gebruikersrol[])
         and exists (select 1 from public.inmetingen i where i.id = inmeting_id and i.status = 'gepland'))
  with check (
    public.heeft_rol(tenant_id, array['directie','verkoop','kantoor']::public.gebruikersrol[])
    and exists (
      select 1 from public.inmetingen i
      join public.posities ps on ps.offerte_id = i.offerte_id and ps.id = inmeting_regels.positie_id and ps.tenant_id = i.tenant_id
      where i.id = inmeting_regels.inmeting_id and i.tenant_id = inmeting_regels.tenant_id and i.status = 'gepland')
  );
create policy inmeting_regels_verwijderen on public.inmeting_regels for delete to authenticated
  using (public.heeft_rol(tenant_id, array['directie','verkoop','kantoor']::public.gebruikersrol[])
         and exists (select 1 from public.inmetingen i where i.id = inmeting_id and i.status = 'gepland'));

-- Toegang: de toegewezen inmeter alleen zolang hij lid is van het bedrijf.
create or replace function public.inmeting_toegang(p_inmeting uuid) returns boolean
  language sql stable security definer set search_path = ''
  as $$
  select exists (
    select 1 from public.inmetingen i
    where i.id = p_inmeting
      and (
        (i.inmeter_id = auth.uid() and public.is_lid(i.tenant_id, auth.uid()))
        or public.heeft_rol(i.tenant_id, array['directie','verkoop','kantoor']::public.gebruikersrol[])
      )
  )
$$;

create or replace function public.inmeting_overzicht() returns jsonb
  language sql stable security definer set search_path = ''
  as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', i.id,
    'gepland_op', i.gepland_op,
    'status', i.status,
    'project_naam', p.naam,
    'project_nummer', p.nummer,
    'klant_naam', k.naam,
    'plaats', (select a.plaats from public.adressen a where a.klant_id = k.id and a.tenant_id = i.tenant_id and a.soort = 'project' order by a.aangemaakt limit 1),
    'adres', (select a.straat || ' ' || a.huisnummer || coalesce(' ' || a.toevoeging, '') from public.adressen a where a.klant_id = k.id and a.tenant_id = i.tenant_id and a.soort = 'project' order by a.aangemaakt limit 1),
    'aantal_posities', (select count(*) from public.posities ps where ps.offerte_id = i.offerte_id and ps.tenant_id = i.tenant_id),
    'ingevuld', (select count(*) from public.inmeting_regels r where r.inmeting_id = i.id and r.bestel_breedte_mm is not null and r.bestel_hoogte_mm is not null)
  ) order by i.gepland_op), '[]'::jsonb)
  from public.inmetingen i
  join public.projecten p on p.id = i.project_id and p.tenant_id = i.tenant_id
  join public.klanten k on k.id = p.klant_id and k.tenant_id = i.tenant_id
  where i.status <> 'geannuleerd'
    and (
      (i.inmeter_id = auth.uid() and public.is_lid(i.tenant_id, auth.uid()))
      or public.heeft_rol(i.tenant_id, array['directie','verkoop','kantoor']::public.gebruikersrol[])
    )
$$;

create or replace function public.inmeting_detail(p_inmeting uuid) returns jsonb
  language plpgsql stable security definer set search_path = ''
  as $$
declare
  v_json jsonb;
begin
  if not public.inmeting_toegang(p_inmeting) then return null; end if;
  select jsonb_build_object(
    'id', i.id,
    'status', i.status,
    'gepland_op', i.gepland_op,
    'notitie', i.notitie,
    'project_id', p.id,
    'project_nummer', p.nummer,
    'project_naam', p.naam,
    'klant_naam', k.naam,
    'telefoon', k.telefoon,
    'mobiel', k.mobiel,
    'adres', (select jsonb_build_object('straat', a.straat, 'huisnummer', a.huisnummer, 'toevoeging', a.toevoeging, 'postcode', a.postcode, 'plaats', a.plaats, 'bereikbaarheid', a.bereikbaarheid, 'woningtype', a.woningtype, 'bouwjaar', a.bouwjaar)
              from public.adressen a where a.klant_id = k.id and a.tenant_id = i.tenant_id and a.soort = 'project' order by a.aangemaakt limit 1),
    'posities', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'positie_id', ps.id,
        'nummer', ps.nummer,
        'ruimte', ps.ruimte,
        'aantal', ps.aantal,
        'config', ps.config,
        'gemeten', (select jsonb_build_object('bestel_breedte_mm', r.bestel_breedte_mm, 'bestel_hoogte_mm', r.bestel_hoogte_mm, 'binnen_breedte_mm', r.binnen_breedte_mm, 'binnen_hoogte_mm', r.binnen_hoogte_mm, 'buiten_breedte_mm', r.buiten_breedte_mm, 'buiten_hoogte_mm', r.buiten_hoogte_mm, 'opmerking', r.opmerking)
                    from public.inmeting_regels r where r.inmeting_id = i.id and r.positie_id = ps.id)
      ) order by ps.nummer), '[]'::jsonb)
      from public.posities ps where ps.offerte_id = i.offerte_id and ps.tenant_id = i.tenant_id
    )
  ) into v_json
  from public.inmetingen i
  join public.projecten p on p.id = i.project_id and p.tenant_id = i.tenant_id
  join public.klanten k on k.id = p.klant_id and k.tenant_id = i.tenant_id
  where i.id = p_inmeting;
  return v_json;
end $$;
