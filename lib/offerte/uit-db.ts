import type { OfferteRegel } from "./types";

/** Een regel zoals de database die teruggeeft, met bij een positie de prijs en het aantal van de positie zelf. */
export type RegelRij = {
  soort: OfferteRegel["soort"];
  aantal: number | string;
  prijs: number | string;
  prijs_override: number | string | null;
  korting_modus: "percentage" | "bedrag" | null;
  korting_waarde: number | string | null;
  posities: { prijs: number | string; aantal: number | string } | null;
};

/** Zet database-regels om naar de vorm voor de berekening. Bij een positie gelden de prijs en het aantal van de positie. */
export function regelsUitDb(rijen: RegelRij[]): OfferteRegel[] {
  return rijen.map((r, i) => ({
    id: String(i),
    soort: r.soort,
    aantal: r.soort === "positie" ? Number(r.posities?.aantal ?? 1) : Number(r.aantal),
    prijs: r.soort === "positie" ? Number(r.posities?.prijs ?? 0) : Number(r.prijs),
    prijsOverride: r.prijs_override === null ? null : Number(r.prijs_override),
    modus: r.korting_modus,
    waarde: r.korting_waarde === null ? null : Number(r.korting_waarde),
  }));
}
