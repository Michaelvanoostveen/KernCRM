-- RLS-controle: draai na de migraties op een lege testdatabase (met Supabase-auth of een stub van auth.users en auth.uid()).
-- Verwacht: A ziet 1 klant en 1 tenant, een insert in een andere tenant wordt geweigerd, een monteur ziet 0 klanten.
insert into auth.users values ('00000000-0000-0000-0000-00000000000a'),('00000000-0000-0000-0000-00000000000b');
insert into tenants(id,naam,slug) values ('11111111-1111-1111-1111-111111111111','A','a'),('22222222-2222-2222-2222-222222222222','B','b');
insert into tenant_leden values ('11111111-1111-1111-1111-111111111111','00000000-0000-0000-0000-00000000000a','verkoop'),
                                ('22222222-2222-2222-2222-222222222222','00000000-0000-0000-0000-00000000000b','monteur');
insert into klanten(tenant_id,naam) values ('11111111-1111-1111-1111-111111111111','Klant A'),('22222222-2222-2222-2222-222222222222','Klant B');
set role authenticated;
set request.jwt.claim.sub='00000000-0000-0000-0000-00000000000a';
select 'A ziet klanten:', count(*) from klanten;
select 'A ziet tenants:', count(*) from tenants;
do $$ begin insert into klanten(tenant_id,naam) values ('22222222-2222-2222-2222-222222222222','inbraak'); raise exception 'FOUT: insert in andere tenant gelukt'; exception when insufficient_privilege then raise notice 'OK: insert andere tenant geweigerd'; end $$;
set request.jwt.claim.sub='00000000-0000-0000-0000-00000000000b';
select 'monteur B ziet klanten:', count(*) from klanten;
