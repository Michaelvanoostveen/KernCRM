// Zet de Teamleader-artikelcatalogus (CSV) om naar een SQL-bestand met seed-data voor één bedrijf.
// Gebruik: node scripts/genereer-artikelen.mjs /pad/naar/artikelen-kernkozijnen-nl.csv kernkozijnen
import fs from "node:fs";

const [bron, slug] = process.argv.slice(2);
if (!bron || !slug) throw new Error("Geef het pad naar de CSV en de slug van het bedrijf mee.");

// Parser voor ; gescheiden CSV met aanhalingstekens (en dubbele aanhalingstekens binnen een veld).
function lees(tekst) {
  const rijen = []; let rij = [], veld = "", tussen = false;
  for (let i = 0; i < tekst.length; i++) {
    const c = tekst[i];
    if (tussen) {
      if (c === '"' && tekst[i + 1] === '"') { veld += '"'; i++; }
      else if (c === '"') tussen = false;
      else veld += c;
    } else if (c === '"') tussen = true;
    else if (c === ";") { rij.push(veld); veld = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && tekst[i + 1] === "\n") i++; rij.push(veld); veld = ""; if (rij.some(Boolean)) rijen.push(rij); rij = []; }
    else veld += c;
  }
  if (veld || rij.length) { rij.push(veld); rijen.push(rij); }
  return rijen;
}

const [kop, ...data] = lees(fs.readFileSync(bron, "utf8").replace(/^﻿/, ""));
const kolom = (naam) => { const i = kop.indexOf(naam); if (i < 0) throw new Error(`Kolom ontbreekt: ${naam}`); return i; };
const k = { groep: kolom("Artikelgroep"), code: kolom("Artikelcode"), naam: kolom("Naam"), oms: kolom("Omschrijving"), eenheid: kolom("Eenheid"), prijs: kolom("Verkoopprijs excl. btw"), btw: kolom("Btw-tarief") };

const sql = (t) => `'${String(t).replace(/'/g, "''")}'`;
const getal = (t) => { const n = Number(String(t).replace(",", ".")); if (!Number.isFinite(n) || n < 0) throw new Error(`Ongeldige prijs: ${t}`); return n.toFixed(2); };
// Groepen die de configurator al dekt (kozijnen, glas, kleur, beslag) en groepen die KernKozijnen volgens de website niet aanbiedt (rolluiken, horren) staan inactief.
const inactief = (groep) => /^(01|02|03|04|05|07|08) /.test(groep);

const waarden = data.map((r) => `  (${sql(r[k.groep])}, ${sql(r[k.code])}, ${sql(r[k.naam])}, ${sql(r[k.oms])}, ${sql(r[k.eenheid])}, ${getal(r[k.prijs])}, round(${getal(r[k.prijs])} * 1.174, 2), ${Number(r[k.btw])}, ${inactief(r[k.groep]) ? "false" : "true"})`);
const uit = `-- GEGENEREERD door scripts/genereer-artikelen.mjs uit de Teamleader-artikelcatalogus (${data.length} artikelen).
-- Voegt de artikelen toe aan het bedrijf met slug '${slug}'. Opnieuw uitvoeren verandert bestaande artikelen niet.
-- Prijs incl. btw = prijs excl. btw x 1,174 (21% over 70% en 9% over 30% van het bedrag excl. btw).

insert into public.artikelen (tenant_id, groep, code, naam, omschrijving, eenheid, verkoopprijs_excl, verkoopprijs_incl, btw_tarief_bron, actief)
select t.id, v.groep, v.code, v.naam, v.omschrijving, v.eenheid, v.excl, v.incl, v.btw, v.actief
from public.tenants t
cross join (values
${waarden.join(",\n")}
) as v (groep, code, naam, omschrijving, eenheid, excl, incl, btw, actief)
where t.slug = ${sql(slug)}
on conflict (tenant_id, code) do nothing;
`;
fs.writeFileSync(new URL("../supabase/migrations/20261105000008_seed_artikelen_kernkozijnen.sql", import.meta.url), uit);

// Dezelfde gegevens als JSON, voor de knop "Standaardcatalogus importeren" in de app.
const json = data.map((r) => ({
  groep: r[k.groep], code: r[k.code], naam: r[k.naam], omschrijving: r[k.oms], eenheid: r[k.eenheid],
  verkoopprijs_excl: Number(getal(r[k.prijs])), verkoopprijs_incl: Math.round(Number(getal(r[k.prijs])) * 1.174 * 100) / 100,
  btw_tarief_bron: Number(r[k.btw]), actief: !inactief(r[k.groep]),
}));
fs.writeFileSync(new URL("../lib/offerte/catalogus-kernkozijnen.json", import.meta.url), JSON.stringify(json, null, 1) + "\n");
console.log(`${data.length} artikelen geschreven.`);
