-- Fase 1, stap 11: de getekende offerte (PDF) toont de handtekening van de klant zelf. Alleen de eigen handtekening van de klant, via zijn geheime link.

create or replace function public.offerte_publiek(p_token text) returns jsonb
  language plpgsql stable security definer set search_path = ''
  as $$
declare
  o public.offertes;
  r jsonb;
begin
  if p_token is null or length(p_token) < 32 then return null; end if;
  select * into o from public.offertes where publiek_token = p_token and status in ('verstuurd', 'akkoord');
  if not found then return null; end if;

  select jsonb_build_object(
    'bedrijf', t.naam,
    'nummer', p.nummer,
    'versie', o.versie,
    'status', o.status,
    'geldig_tot', o.geldig_tot,
    'verstuurd_op', o.verstuurd_op,
    'project_naam', p.naam,
    'klant_naam', k.naam,
    'aanhef', k.aanhef,
    'achternaam', k.achternaam,
    'adres', (select jsonb_build_object('straat', a.straat, 'huisnummer', a.huisnummer, 'toevoeging', a.toevoeging, 'postcode', a.postcode, 'plaats', a.plaats)
              from public.adressen a where a.klant_id = k.id and a.soort = 'project' limit 1),
    'eigen_totaal', o.totaal_override,
    'akkoord', (select jsonb_build_object('naam', ak.naam, 'op', ak.op, 'handtekening', ak.handtekening) from public.offerte_akkoorden ak where ak.offerte_id = o.id),
    'regels', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'soort', rg.soort,
        'titel', rg.titel,
        'tekst', rg.tekst,
        'aantal', case when rg.soort = 'positie' then ps.aantal else rg.aantal end,
        'prijs', case when rg.soort = 'positie' then coalesce(rg.prijs_override, ps.prijs)
                      when rg.soort = 'artikel' then coalesce(rg.prijs_override, rg.prijs)
                      else 0 end,
        'modus', rg.korting_modus,
        'waarde', rg.korting_waarde,
        'eenheid', ar.eenheid,
        'positie', case when ps.id is not null then jsonb_build_object('nummer', ps.nummer, 'ruimte', ps.ruimte, 'config', ps.config) end
      ) order by rg.volgorde), '[]'::jsonb)
      from public.offerte_regels rg
      left join public.posities ps on ps.id = rg.positie_id
      left join public.artikelen ar on ar.id = rg.artikel_id
      where rg.offerte_id = o.id
    )
  ) into r
  from public.tenants t, public.projecten p, public.klanten k
  where t.id = o.tenant_id and p.id = o.project_id and k.id = p.klant_id;
  return r;
end $$;
