-- Fase 1, stap 3: volledige contactgegevens (persoon, bedrijf, contact) en adresdetails.
-- Alleen kolommen toevoegen; de bestaande RLS-policies op klanten en adressen blijven gelden.

alter table public.klanten
  add column aanhef text check (aanhef in ('dhr', 'mevr', 'geen')),
  add column voornaam text,
  add column tussenvoegsel text,
  add column achternaam text,
  add column bedrijfsnaam text,
  add column kvk text,
  add column btw_nummer text,
  add column website text,
  add column mobiel text,
  add column factuur_email text,
  add column taal text not null default 'nl',
  add column marketing_toestemming boolean not null default false;

alter table public.adressen
  add column toevoeging text,
  add column land text not null default 'NL',
  add column bouwjaar integer check (bouwjaar between 1500 and 2100),
  add column woningtype text,
  add column bereikbaarheid text,
  add column monument boolean not null default false;
