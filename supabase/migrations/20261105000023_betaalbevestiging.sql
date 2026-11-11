-- Fase 3, stap 3: vastleggen dat de klant een bevestiging van zijn betaling heeft gekregen.
-- Een betaling zelf blijft onveranderlijk; alleen het moment van "bevestiging verstuurd" kan eenmalig worden gezet.

alter table public.factuur_betalingen add column bevestiging_verstuurd_op timestamptz;

create or replace function public.factuur_stukken_vergrendelen() returns trigger
  language plpgsql set search_path = ''
  as $$
begin
  if tg_op = 'UPDATE' and tg_table_name in ('factuur_betalingen', 'factuur_wijzigingen', 'factuur_herinneringen')
     and old.door is not null and new.door is null and (to_jsonb(new) - 'door') = (to_jsonb(old) - 'door') then
    return new;
  end if;
  -- Eenmalig: de bevestiging van een betaling als verstuurd markeren.
  if tg_op = 'UPDATE' and tg_table_name = 'factuur_betalingen'
     and old.bevestiging_verstuurd_op is null and new.bevestiging_verstuurd_op is not null
     and (to_jsonb(new) - 'bevestiging_verstuurd_op') = (to_jsonb(old) - 'bevestiging_verstuurd_op') then
    return new;
  end if;
  raise exception 'Facturen, betalingen en het logboek kunnen niet worden gewijzigd of verwijderd' using errcode = '55000';
end $$;

-- Legt vast dat de bevestiging van deze betaling naar de klant is gestuurd.
create function public.markeer_betaling_bevestigd(p_betaling uuid) returns jsonb
  language plpgsql security definer set search_path = ''
  as $$
declare
  b public.factuur_betalingen;
begin
  select * into b from public.factuur_betalingen where id = p_betaling for update;
  if not found or not public.heeft_rol(b.tenant_id, array['directie','kantoor']::public.gebruikersrol[]) then
    return jsonb_build_object('ok', false, 'fout', 'geen_toegang');
  end if;
  if b.bevestiging_verstuurd_op is not null then return jsonb_build_object('ok', false, 'fout', 'al_bevestigd'); end if;
  update public.factuur_betalingen set bevestiging_verstuurd_op = now() where id = b.id;
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.markeer_betaling_bevestigd(uuid) from public, anon;
grant execute on function public.markeer_betaling_bevestigd(uuid) to authenticated;
