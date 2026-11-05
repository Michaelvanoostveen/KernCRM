import { REGELS_KERNKOZIJNEN } from "./regels-kernkozijnen";
import type { Prijsregels } from "./types";

/** Wordt bij elke positie bewaard, zodat later zichtbaar blijft met welke prijsregels de prijs is berekend. */
export const PRIJSREGELS_VERSIE = "kernkozijnen-2026-11-04";

/** Haalt de prijsregels op. Nu nog vast voor KernKozijnen; later per bedrijf uit de database. */
export function haalPrijsregels(): Prijsregels {
  return REGELS_KERNKOZIJNEN;
}

export * from "./berekenen";
export type * from "./types";
