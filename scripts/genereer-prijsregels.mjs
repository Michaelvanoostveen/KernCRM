// Leest de prijsregels uit de website-configurator en schrijft:
//   lib/prijs/regels-kernkozijnen.ts   (seed-data voor de tenant KernKozijnen)
//   lib/prijs/prijs.golden.json        (uitkomsten van de website zelf, voor de tests)
//   lib/tekening/tekening.golden.json  (vingerafdrukken van de SVG's van de website, voor de tests)
// Gebruik: node scripts/genereer-prijsregels.mjs /pad/naar/kernkozijnen/configurator/index.html
import fs from "node:fs";
import vm from "node:vm";
import crypto from "node:crypto";

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

// ── Tekeningen ──
// De tekencode van de website draait hier letterlijk; per configuratie bewaren we een vingerafdruk van de SVG.
const tekenVan = html.indexOf("  var PROFILE = {");
const tekenTot = html.indexOf("  // Mini-SVG voor een variant-tegel");
const glasRegel = html.indexOf("  var GLASSFILL");
if ([tekenVan, tekenTot, glasRegel].some((i) => i < 0)) throw new Error("Tekencode niet gevonden; pas dit script aan.");
vm.runInContext(html.slice(glasRegel, html.indexOf("\n", glasRegel)) + "\n" + html.slice(tekenVan, tekenTot), ctx);

const rnd2 = mulberry32(777);
const kies2 = (lijst) => lijst[Math.floor(rnd2() * lijst.length)];
const gewichten = (n) => Array.from({ length: n }, () => 300 + Math.floor(rnd2() * 900));
const hash = (svg) => crypto.createHash("sha256").update(svg).digest("hex").slice(0, 16);
const tekeningen = [];
for (const [pKey, p] of Object.entries(regels.producten)) {
  for (const v of p.variants) {
    for (const [w, h] of [[p.wMin, p.hMin], [p.wDef, p.hDef], [p.wMax, p.hMax]]) {
      const cfg = { product: pKey, variant: v.key, w, h, kleur: kies2(Object.keys(regels.kleuren)) };
      if (rnd2() < 0.4) cfg.kleurVleugel = kies2(Object.keys(regels.kleuren));
      if (v.cols && rnd2() < 0.5) cfg.cols = v.cols.map(() => kies2(regels.vakVolgorde));
      const aantalKolommen = v.cols ? v.cols.length : p.kind === "door" ? (v.nL ?? (v.sideL ? 1 : 0)) + 1 + (v.nR ?? (v.sideR ? 1 : 0)) : 0;
      if (aantalKolommen > 1 && rnd2() < 0.5) cfg.kolombreedtes = gewichten(aantalKolommen);
      const rijen = v.stack ? v.stack.length : v.grid ? v.grid.r : p.kind === "door" ? (v.top ? 2 : 0) : p.kind === "window" ? 1 + (v.topLight ? 1 : 0) + (v.bottomLight ? 1 : 0) : 0;
      if (rijen > 1 && rnd2() < 0.5) cfg.rijhoogtes = gewichten(rijen);

      // Zoals de website: variant met gekozen vaktypes (effVariant / computeItem), kleuren via kleurPaar.
      let ve = v;
      const bron = v.cols ? "cols" : v.stack ? "stack" : null;
      if (cfg.cols && bron && cfg.cols.length === v[bron].length) {
        ve = { ...v, [bron]: cfg.cols.slice() };
        if (ve.stolp && !(cfg.cols.length === 2 && cfg.cols.every((t) => t !== "fixed"))) ve.stolp = false;
      }
      const kp = vm.runInContext(`kleurPaar(${JSON.stringify(cfg.kleur)}, ${JSON.stringify(cfg.kleurVleugel ?? null)})`, ctx);
      ctx.__ve = ve; ctx.__kp = kp; ctx.__colW = cfg.kolombreedtes ?? null; ctx.__rowH = cfg.rijhoogtes ?? null;
      const svg = vm.runInContext(`buildSVG(${JSON.stringify(p.kind)}, __ve, ${w / h}, __kp.k, __colW, __rowH, false, ${w}, __kp.v)`, ctx);
      tekeningen.push({ cfg, hash: hash(svg), lengte: svg.length, ...(tekeningen.length < 3 ? { svg } : {}) });
    }
  }
}
fs.writeFileSync(new URL("../lib/tekening/tekening.golden.json", import.meta.url), JSON.stringify({ bron: "configurator/index.html (buildSVG, anim uit)", hashAlgoritme: "sha256, eerste 16 tekens", tekeningen }, null, 1) + "\n");
console.log(`${tekeningen.length} gouden tekeningen.`);
