import type { Configuratie, Prijsberekening, Prijsregels, Product, Variant } from "./types";

export class PrijsFout extends Error {}

function zoek<T>(lijst: Record<string, T>, sleutel: string, wat: string): T {
  const gevonden = lijst[sleutel];
  if (!gevonden) throw new PrijsFout(`Onbekende ${wat}: "${sleutel}".`);
  return gevonden;
}

/** Vloeiend prijsplafond: tot 75% van het maximum lineair, daarboven asymptotisch naar het maximum. */
export function softCap(sub: number, max: number): number {
  if (!max || sub <= 0) return sub;
  const knie = max * 0.75;
  const ruimte = max - knie;
  if (sub <= knie) return sub;
  return knie + ruimte * (1 - Math.exp(-(sub - knie) / ruimte));
}

/** Prijsfactor van de indeling, inclusief wijzigingen per vak. Een ongewijzigde indeling houdt exact zijn eigen factor. */
export function indelingFactor(regels: Prijsregels, variant: Variant, cols?: string[] | null): number {
  if (!cols || !variant.cols || cols.length !== variant.cols.length) return variant.mult;
  let verschil = 0;
  for (let i = 0; i < cols.length; i++) {
    const oud = regels.vak[variant.cols[i]];
    const nieuw = regels.vak[cols[i]];
    if (oud && nieuw) verschil += nieuw.f - oud.f;
  }
  return Math.max(0.5, variant.mult + verschil * regels.vakDemping);
}

/** Kozijn en vleugel in een andere kleur kost niets extra: de duurste kleurfactor geldt. */
export function kleurFactor(regels: Prijsregels, kleur: string, kleurVleugel?: string | null): number {
  const k = zoek(regels.kleuren, kleur, "kleur");
  const tweede = kleurVleugel && kleurVleugel !== kleur ? regels.kleuren[kleurVleugel] : undefined;
  return tweede ? Math.max(k.mult, tweede.mult) : k.mult;
}

export function zoekProduct(regels: Prijsregels, sleutel: string): Product {
  return zoek(regels.producten, sleutel, "product");
}

export function zoekVariant(product: Product, sleutel: string): Variant {
  const v = product.variants.find((x) => x.key === sleutel);
  if (!v) throw new PrijsFout(`Onbekende indeling "${sleutel}" voor ${product.label}.`);
  return v;
}

/** Rekent de verkoopprijs van één positie uit, met dezelfde formule als de website-configurator. */
export function berekenPrijs(regels: Prijsregels, cfg: Configuratie): Prijsberekening {
  const product = zoekProduct(regels, cfg.product);
  const variant = zoekVariant(product, cfg.variant);
  const glas = zoek(regels.glas, cfg.glas, "glassoort");
  const beslag = zoek(regels.beslag, cfg.beslag, "beslag");
  const binnen = zoek(regels.binnen, cfg.binnen, "binnenafwerking");
  const profiel = zoek(regels.profielen, cfg.profiel, "profielsysteem");
  if (!(cfg.w > 0 && cfg.h > 0)) throw new PrijsFout("Breedte en hoogte moeten groter dan 0 zijn.");

  const m2 = (cfg.w / 1000) * (cfg.h / 1000);
  const factoren = {
    glas: glas.mult,
    kleur: kleurFactor(regels, cfg.kleur, cfg.kleurVleugel),
    beslag: beslag.mult,
    indeling: indelingFactor(regels, variant, cfg.cols),
    binnen: binnen.mult,
    profiel: profiel.mult,
  };
  const basis = product.base + Math.max(0, m2 - product.stdM2) * product.perM2;
  // Dezelfde volgorde van vermenigvuldigen als de website, zodat de uitkomst bit voor bit gelijk is.
  const ruw = basis * factoren.glas * factoren.kleur * factoren.beslag * factoren.indeling * factoren.binnen * factoren.profiel;
  const begrensd = softCap(ruw, product.priceMax);

  const waarschuwingen: string[] = [];
  if (cfg.w < product.wMin || cfg.w > product.wMax) waarschuwingen.push(`Breedte ${cfg.w} mm valt buiten ${product.wMin} tot ${product.wMax} mm.`);
  if (cfg.h < product.hMin || cfg.h > product.hMax) waarschuwingen.push(`Hoogte ${cfg.h} mm valt buiten ${product.hMin} tot ${product.hMax} mm.`);

  const glasM2 = Math.max(0, m2 * 0.8);
  return {
    prijs: Math.round(begrensd / 10) * 10,
    m2,
    ruw,
    basis,
    factoren,
    factor: factoren.glas * factoren.kleur * factoren.beslag * factoren.indeling * factoren.binnen * factoren.profiel,
    plafondActief: begrensd < ruw,
    isde: { laag: Math.round(glasM2 * glas.isdeLow), hoog: Math.round(glasM2 * glas.isdeHigh) },
    waarschuwingen,
  };
}
