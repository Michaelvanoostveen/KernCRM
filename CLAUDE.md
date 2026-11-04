# KernCRM

Eigen CRM voor kozijnbedrijven, ter vervanging van Teamleader. Eerste klant: KernKozijnen B.V. (Hengelo,
kunststof kozijnen, Schüco LivIng 82 en Aluplast Ideal 7000 NL, eigen monteurs, 10 jaar garantie).
Het product moet vanaf dag één schaalbaar en verkoopbaar zijn aan andere kozijnbedrijven (multi-tenant).

**Volledig functioneel ontwerp: `docs/ontwerp.md`** — lees dat eerst. Het is de bron van waarheid voor scope,
modules, datamodel, rollen, koppelingen, migratie en fasering. Wijzigt een besluit, werk dan ook dat document bij.

## Kernidee
Het knelpunt bij Teamleader: kozijntekeningen worden buiten het CRM gemaakt en met de hand in de offerte gezet.
In KernCRM stelt de verkoper elk kozijn (een *positie*) in het CRM samen; het systeem tekent het (SVG) en rekent
de prijs. Dezelfde positie loopt door van offerte → inmeting → bestelling → montage → oplevering → service.
Tekening en maten worden maar één keer ingevoerd.

## Besluiten (vastgelegd 2026-11-04)
- Stack: Next.js (App Router, TypeScript) + Supabase (PostgreSQL, Auth, Storage) in EU-regio; hosting Vercel.
- Multi-tenant: elke tabel heeft `tenant_id`; scheiding via Postgres Row Level Security. Catalogus, prijsfactoren,
  huisstijl, nummering, leveranciers en koppelingen zijn instellingen per tenant, nooit hardcoded.
- UI-taal Nederlands. Bedragen in euro, `nl-NL`-notatie. Prijzen in de configurator zijn incl. btw, all-in.
- Modules: 1 Klantbestand + activiteit · 2 Offerte + configurator · 3 Inmeting + montageplanning ·
  4 Bestellen + facturatie (incl. ISDE) · 5 Service, opleverpunten, werkbonnen. Plus klantportaal.
- Leveranciers: Kozijnbouw Enschede en Eko-Okna (Polen).
- Boekhouding: Twinfield (verkoopfacturen, debiteuren, betaalstatus). Inkoopfacturen blijven via Basecone binnenkomen.
- Mail/agenda: Outlook / Microsoft 365 via Microsoft Graph.
- Migratie: alles uit Teamleader via de Teamleader Focus API (+ CSV waar nodig).
- Inkoopprijzen worden later handmatig ingevoerd; tot dan toont het CRM geen marge.
- Fasering: 1 Verkoop → 2 Uitvoering → 3 Financieel (daarna Teamleader opzeggen) → 4 Service + portaal.

## Bronnen in de websitemap (`~/KernKozijnen`, apart project, niet aanpassen vanuit hier)
- `configurator/index.html` — de werkende website-configurator. Hierin staan de prijslogica en tekencode die we
  overnemen:
  - `PRODUCTS` (raam, voordeur, achterdeur, schuifpui, tuindeuren, balkondeur) met `base`, `stdM2`, `perM2`,
    `priceMax`, min/max-maten en `variants` (indelingen met `mult`)
  - `GLASS`, `COLOR`, `BESLAG`, `BINNEN`, `PROFIELEN` (Aluplast 0,90), `VAK` + `VAK_DEMPING` (0,80), `indelingMult`, `kleurPaar`, `softCap`
  - prijsformule: `(base + max(0, m2 - stdM2) * perM2) * glas * kleur * beslag * indeling * binnen * profiel`, daarna `softCap(sub, priceMax)`, afronden op € 10
  - SVG-tekenen: `buildSVG`, `drawWindow`, `drawDoor`, `drawSlider`, `drawFrench`, `sym` (draairichtingssymbolen)
- `teamleader/artikelen-kernkozijnen-nl.csv` — huidige artikelcatalogus (97 artikelen, 15 groepen, verkoopprijzen excl. btw).
- `teamleader/offertebijlagen/` — huidige productbijlagen (Schüco/Aluplast), doorsnede-tekeningen, huisstijlbeelden.
- `prijzen.py` — bevestigde stelposten (21-10-2026): raam € 1.890 (Aluplast) – € 2.100 (Schüco), achterdeur € 3.800,
  voordeur € 4.700, schuifpui € 6.400, tuindeuren € 7.200.

Bij het overnemen: zet de constanten om naar seed-data in de database (per tenant), en de tekencode naar een
gedeelde TypeScript-module (`packages/kozijn-tekening` of `lib/tekening`) die zowel in de configurator, de
offerte-PDF, de inmeetstaat als de werkbon gebruikt wordt. Houd de uitkomsten gelijk aan de website (schrijf tests
die bekende configuraties en prijzen van de website vergelijken).

## Nog open (zie `docs/ontwerp.md`)
- Welk profielsysteem bij welke leverancier; bestelformat van Kozijnbouw Enschede en Eko-Okna
- Aantal gebruikers per rol, termijnschema, klantportaal in fase 1 of later, directierapportages
- Verkoopmodel naar andere bedrijven (per gebruiker / per bedrijf / licentie)

## Werkafspraken
- Begin met fase 1. Kleine, toetsbare stappen; elke stap werkend opleveren.
- Database-wijzigingen alleen via migraties (`supabase/migrations`). RLS op elke tabel vanaf de eerste migratie.
- Geen geheimen in de repo; gebruik `.env.local` (staat in `.gitignore`).
