// Leest de prijsregels uit de website-configurator en schrijft:
//   lib/prijs/regels-kernkozijnen.ts   (seed-data voor de tenant KernKozijnen)
//   lib/prijs/prijs.golden.json        (uitkomsten van de website zelf, voor de tests)
// Gebruik: node scripts/genereer-prijsregels.mjs /pad/naar/kernkozijnen/configurator/index.html
import fs from "node:fs";
import vm from "node:vm";

const bron = process.argv[2];
if (!bron) throw new Error("Geef het pad naar configurator/index.html mee.");
const html = fs.readFileSync(bron, "utf8");

// Stukken code uit de website die we letterlijk laten draaien.
const van = html.indexOf("  var PRODUCTS = {");
const eindKleur = html.indexOf("  function kleurPaar");
const totKleur = html.indexOf("\n  }\n", eindKleur) + 5;
const softVan = html.indexOf("  function softCap");
const softTot = html.indexOf("\n  }\n", softVan) + 5;
const profVan = html.indexOf("  var PROFIELEN = {");
const profTot = html.indexOf("};", profVan) + 2;
if ([van, eindKleur, softVan, profVan].some((i) => i < 0)) throw new Error("De structuur van de configurator is gewijzigd; pas dit script aan.");

const ctx = vm.createContext({});
vm.runInContext(html.slice(van, totKleur) + html.slice(softVan, softTot) + html.slice(profVan, profTot), ctx);
const g = (naam) => vm.runInContext(naam, ctx);

const regels = {
  producten: g("PRODUCTS"),
  glas: g("GLASS"),
  kleuren: g("COLOR"),
  beslag: g("BESLAG"),
  binnen: g("BINNEN"),
  profielen: g("PROFIELEN"),
  vak: g("VAK"),
  vakVolgorde: g("VAK_VOLGORDE"),
  vakDemping: g("VAK_DEMPING"),
};

fs.writeFileSync(
  new URL("../lib/prijs/regels-kernkozijnen.ts", import.meta.url),
  `// GEGENEREERD door scripts/genereer-prijsregels.mjs uit configurator/index.html. Niet met de hand aanpassen.
// Dit zijn de prijsregels van KernKozijnen. Later komen ze per bedrijf uit de database.
import type { Prijsregels } from "./types";

export const REGELS_KERNKOZIJNEN: Prijsregels = ${JSON.stringify(regels, null, 2)};
`,
);

// Gouden uitkomsten: de functies van de website zelf rekenen de configuraties door.
function mulberry32(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const rnd = mulberry32(20261104);
const kies = (lijst) => lijst[Math.floor(rnd() * lijst.length)];
const sleutels = (o) => Object.keys(o);

const gevallen = [];
for (const [pKey, p] of Object.entries(regels.producten)) {
  for (const v of p.variants) {
    for (const [w, h] of [[p.wMin, p.hMin], [p.wDef, p.hDef], [p.wMax, p.hMax]]) {
      const cfg = { product: pKey, variant: v.key, w, h, glas: kies(sleutels(regels.glas)), kleur: kies(sleutels(regels.kleuren)), beslag: kies(sleutels(regels.beslag)), binnen: kies(sleutels(regels.binnen)), profiel: kies(sleutels(regels.profielen)) };
      if (rnd() < 0.4) cfg.kleurVleugel = kies(sleutels(regels.kleuren));
      if (v.cols && rnd() < 0.5) cfg.cols = v.cols.map(() => kies(regels.vakVolgorde));
      const m2 = (w / 1000) * (h / 1000);
      const kp = vm.runInContext(`kleurPaar(${JSON.stringify(cfg.kleur)}, ${JSON.stringify(cfg.kleurVleugel ?? null)})`, ctx);
      const ind = vm.runInContext(`indelingMult(${JSON.stringify(v)}, ${JSON.stringify(cfg.cols ?? null)})`, ctx);
      let sub = (p.base + Math.max(0, m2 - p.stdM2) * p.perM2) * regels.glas[cfg.glas].mult * kp.mult * regels.beslag[cfg.beslag].mult * ind * regels.binnen[cfg.binnen].mult * regels.profielen[cfg.profiel].mult;
      sub = vm.runInContext(`softCap(${sub}, ${p.priceMax})`, ctx);
      gevallen.push({ cfg, prijs: Math.round(sub / 10) * 10 });
    }
  }
}
fs.writeFileSync(new URL("../lib/prijs/prijs.golden.json", import.meta.url), JSON.stringify({ bron: "configurator/index.html (website-functies indelingMult, kleurPaar, softCap)", gevallen }, null, 1) + "\n");
console.log(`Regels geschreven; ${gevallen.length} gouden gevallen.`);
