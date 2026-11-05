-- Fase 2, stap 4: foto's bij de inmeting (per positie of algemeen), opgeslagen in een privé-opslag.
-- Bestanden staan onder <inmeting_id>/<foto_id>.<jpg|png|webp>. Wie bij de inmeting hoort (de toegewezen inmeter of een medewerker met
-- schrijfrechten) mag ze zien; toevoegen en verwijderen kan alleen zolang de inmeting gepland is.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('inmeting-fotos', 'inmeting-fotos', false, 8388608, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- Haalt het inmeting-id uit een bestandspad; null als het pad niet de verwachte vorm heeft.
create function public.foto_pad_inmeting(p_pad text) returns uuid
  language sql immutable set search_path = ''
  as $$
  select case
    when p_pad ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$'
    then split_part(p_pad, '/', 1)::uuid
  end
$$;

-- Mag de ingelogde gebruiker foto's toevoegen of verwijderen? Alleen bij een geplande inmeting waar hij toegang toe heeft.
create function public.inmeting_foto_schrijven(p_inmeting uuid) returns boolean
  language sql stable security definer set search_path = ''
  as $$
  select p_inmeting is not null
    and public.inmeting_toegang(p_inmeting)
    and exists (select 1 from public.inmetingen i where i.id = p_inmeting and i.status = 'gepland')
$$;
revoke all on function public.inmeting_foto_schrijven(uuid) from public, anon;
grant execute on function public.inmeting_foto_schrijven(uuid) to authenticated;

create policy inmeting_fotos_lezen on storage.objects for select to authenticated
  using (bucket_id = 'inmeting-fotos' and public.inmeting_toegang(public.foto_pad_inmeting(name)));
create policy inmeting_fotos_uploaden on storage.objects for insert to authenticated
  with check (bucket_id = 'inmeting-fotos' and public.inmeting_foto_schrijven(public.foto_pad_inmeting(name)));
create policy inmeting_fotos_verwijderen on storage.objects for delete to authenticated
  using (bucket_id = 'inmeting-fotos' and public.inmeting_foto_schrijven(public.foto_pad_inmeting(name)));

create table public.inmeting_fotos (
  id          uuid primary key,
  tenant_id   uuid not null references public.tenants (id) on delete cascade,
  inmeting_id uuid not null references public.inmetingen (id) on delete cascade,
  positie_id  uuid references public.posities (id) on delete cascade,   -- leeg bij een algemene foto
  pad         text not null unique,
  gemaakt_door uuid default auth.uid() references auth.users (id) on delete set null,
  aangemaakt  timestamptz not null default now()
);
create index inmeting_fotos_inmeting_idx on public.inmeting_fotos (inmeting_id);
create index inmeting_fotos_tenant_idx on public.inmeting_fotos (tenant_id);
alter table public.inmeting_fotos enable row level security;
create policy inmeting_fotos_lijst_lezen on public.inmeting_fotos for select to authenticated
  using (public.heeft_rol(tenant_id, array['directie','verkoop','kantoor']::public.gebruikersrol[]));

-- Legt een geüploade foto vast bij de inmeting (en eventueel een positie). Het bestand moet al in de opslag staan.
create function public.inmeting_foto_toevoegen(p_inmeting uuid, p_positie uuid, p_id uuid, p_ext text) returns jsonb
  language plpgsql security definer set search_path = ''
  as $$
declare
  i public.inmetingen;
  v_pad text;
begin
  if not public.inmeting_toegang(p_inmeting) then return jsonb_build_object('ok', false, 'fout', 'geen_toegang'); end if;
  select * into i from public.inmetingen where id = p_inmeting for update;
  if i.status <> 'gepland' then return jsonb_build_object('ok', false, 'fout', 'afgerond'); end if;
  if p_id is null or p_ext not in ('jpg', 'png', 'webp') then return jsonb_build_object('ok', false, 'fout', 'ongeldig'); end if;
  if p_positie is not null and not exists (select 1 from public.posities ps where ps.id = p_positie and ps.offerte_id = i.offerte_id and ps.tenant_id = i.tenant_id) then
    return jsonb_build_object('ok', false, 'fout', 'positie');
  end if;
  if (select count(*) from public.inmeting_fotos where inmeting_id = i.id) >= 60 then return jsonb_build_object('ok', false, 'fout', 'te_veel'); end if;
  v_pad := i.id::text || '/' || p_id::text || '.' || p_ext;
  if not exists (select 1 from storage.objects o where o.bucket_id = 'inmeting-fotos' and o.name = v_pad) then
    return jsonb_build_object('ok', false, 'fout', 'bestand');
  end if;
  insert into public.inmeting_fotos (id, tenant_id, inmeting_id, positie_id, pad, gemaakt_door)
    values (p_id, i.tenant_id, i.id, p_positie, v_pad, auth.uid());
  return jsonb_build_object('ok', true);
exception when unique_violation then
  return jsonb_build_object('ok', false, 'fout', 'ongeldig');
end $$;
revoke all on function public.inmeting_foto_toevoegen(uuid, uuid, uuid, text) from public, anon;
grant execute on function public.inmeting_foto_toevoegen(uuid, uuid, uuid, text) to authenticated;

-- De foto's van een inmeting, voor de inmeter en voor medewerkers.
create function public.inmeting_fotos_lijst(p_inmeting uuid) returns jsonb
  language plpgsql stable security definer set search_path = ''
  as $$
begin
  if not public.inmeting_toegang(p_inmeting) then return '[]'::jsonb; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', f.id, 'positie_id', f.positie_id, 'pad', f.pad) order by f.aangemaakt)
    from public.inmeting_fotos f where f.inmeting_id = p_inmeting
  ), '[]'::jsonb);
end $$;
revoke all on function public.inmeting_fotos_lijst(uuid) from public, anon;
grant execute on function public.inmeting_fotos_lijst(uuid) to authenticated;

-- Haalt een foto uit de lijst en geeft het pad terug, zodat de app het bestand uit de opslag haalt.
create function public.inmeting_foto_verwijderen(p_inmeting uuid, p_foto uuid) returns jsonb
  language plpgsql security definer set search_path = ''
  as $$
declare
  i public.inmetingen;
  v_pad text;
begin
  if not public.inmeting_toegang(p_inmeting) then return jsonb_build_object('ok', false, 'fout', 'geen_toegang'); end if;
  select * into i from public.inmetingen where id = p_inmeting for update;
  if i.status <> 'gepland' then return jsonb_build_object('ok', false, 'fout', 'afgerond'); end if;
  delete from public.inmeting_fotos where id = p_foto and inmeting_id = p_inmeting returning pad into v_pad;
  if v_pad is null then return jsonb_build_object('ok', false, 'fout', 'onbekend'); end if;
  return jsonb_build_object('ok', true, 'pad', v_pad);
end $$;
revoke all on function public.inmeting_foto_verwijderen(uuid, uuid) from public, anon;
grant execute on function public.inmeting_foto_verwijderen(uuid, uuid) to authenticated;
