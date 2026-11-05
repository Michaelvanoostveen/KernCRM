import { berekenPrijs, PrijsFout } from "../prijs/berekenen";
import type { Configuratie, Prijsregels } from "../prijs/types";

/** Leest een configuratie uit onbetrouwbare invoer (bijv. JSON uit een formulier) en controleert de vorm. */
export function leesConfiguratie(invoer: unknown): Configuratie {
  if (typeof invoer !== "object" || invoer === null) throw new PrijsFout("De configuratie is onleesbaar.");
  const o = invoer as Record<string, unknown>;
  const tekst = (k: string) => {
    if (typeof o[k] !== "string" || !o[k]) throw new PrijsFout(`Veld "${k}" ontbreekt.`);
    return o[k] as string;
  };
  const getal = (k: string) => {
    const n = Number(o[k]);
    if (!Number.isFinite(n)) throw new PrijsFout(`Veld "${k}" is geen getal.`);
    return Math.round(n);
  };
  const cols = Array.isArray(o.cols) && o.cols.every((c) => typeof c === "string") ? (o.cols as string[]) : null;
  return {
    product: tekst("product"),
    variant: tekst("variant"),
    w: getal("w"),
    h: getal("h"),
    glas: tekst("glas"),
    kleur: tekst("kleur"),
    kleurVleugel: typeof o.kleurVleugel === "string" && o.kleurVleugel ? o.kleurVleugel : null,
    beslag: tekst("beslag"),
    binnen: tekst("binnen"),
    profiel: tekst("profiel"),
    cols,
  };
}

/** Prijs per stuk volgens de prijsregels; nooit overnemen van wat de browser meestuurt. */
export function prijsVanConfiguratie(regels: Prijsregels, cfg: Configuratie): number {
  return berekenPrijs(regels, cfg).prijs;
}

export function regelTotaal(prijs: number, aantal: number): number {
  return Math.round(prijs * aantal * 100) / 100;
}

export const euro = (n: number) =>
  new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);

/** Korte omschrijving voor in lijsten, bijv. "Raamkozijn · Stolpraam · 1400 × 1200 mm". */
export function positieOmschrijving(regels: Prijsregels, cfg: Configuratie): string {
  const p = regels.producten[cfg.product];
  const v = p?.variants.find((x) => x.key === cfg.variant);
  return [p?.label ?? cfg.product, v?.label ?? cfg.variant, `${cfg.w} × ${cfg.h} mm`].join(" · ");
}
