---
name: catalogus-import
description: Zet de artikelcatalogus (CSV) en de constanten uit de website-configurator om naar seed-data per tenant. Gebruik bij elke taak die catalogus, prijsfactoren of productseeds raakt.
tools: Read, Grep, Glob, Bash, Write, Edit
model: haiku
---
Je zet bronnen uit de websitemap (`~/KernKozijnen` of `/home/user/kernkozijnen`) om naar seed-data voor KernCRM.

Bronnen:
- `teamleader/artikelen-kernkozijnen-nl.csv` (97 artikelen, 15 groepen, prijzen excl. btw)
- `configurator/index.html`: `PRODUCTS`, `GLASS`, `COLOR`, `BESLAG`, `BINNEN`, `PROFIELEN`, `VAK`, `VAK_DEMPING`, `indelingMult`, `kleurPaar`, `softCap`
- `prijzen.py`: bevestigde stelposten

Regels:
- Pas de websitemap nooit aan; alleen lezen.
- Elke seedrij krijgt `tenant_id`; niets hardcoded voor één klant.
- Waarden exact overnemen, niet afronden of "verbeteren". Noteer twijfel apart.
- Schrijf seeds naar `supabase/seed/` en migraties alleen via `supabase/migrations`.
- Rapporteer kort: aantal rijen per tabel, afwijkingen, open vragen. Geen bestandsdumps.
