import { berekenPrijs } from "../prijs/berekenen";
import type { Configuratie, Prijsregels } from "../prijs/types";

/** Vanaf dit verschil in millimeters tussen de offertemaat en de gemeten maat melden we een afwijking. */
export const AFWIJKING_DREMPEL_MM = 5;

export interface Afwijking {
  breedte: number;
  hoogte: number;
  afwijkend: boolean;
}

/** Verschil tussen de gemeten maat en de maat uit de offerte. Positief is groter dan geoffreerd. */
export function bepaalAfwijking(offerte: { w: number; h: number }, gemeten: { breedte: number | null; hoogte: number | null }): Afwijking | null {
  if (gemeten.breedte === null || gemeten.hoogte === null) return null;
  const breedte = gemeten.breedte - offerte.w;
  const hoogte = gemeten.hoogte - offerte.h;
  return { breedte, hoogte, afwijkend: Math.abs(breedte) > AFWIJKING_DREMPEL_MM || Math.abs(hoogte) > AFWIJKING_DREMPEL_MM };
}

const mm = (n: number) => `${n > 0 ? "+" : n < 0 ? "-" : ""}${Math.abs(n)} mm`;

/** Bijvoorbeeld "breedte +14 mm, hoogte -6 mm". Alleen de maten die afwijken. */
export function afwijkingTekst(a: Afwijking): string {
  const delen: string[] = [];
  if (Math.abs(a.breedte) > AFWIJKING_DREMPEL_MM) delen.push(`breedte ${mm(a.breedte)}`);
  if (Math.abs(a.hoogte) > AFWIJKING_DREMPEL_MM) delen.push(`hoogte ${mm(a.hoogte)}`);
  return delen.join(", ");
}

/**
 * Indicatie van het prijsverschil als de positie in de gemeten maat wordt gemaakt, per het aantal van de positie.
 * Een indicatie: handmatige aanpassingen op de offerte zijn hierin niet meegenomen.
 */
export function indicatieMeerwerk(regels: Prijsregels, cfg: Configuratie, gemeten: { breedte: number; hoogte: number }, aantal: number): number {
  const oud = berekenPrijs(regels, cfg).prijs;
  const nieuw = berekenPrijs(regels, { ...cfg, w: gemeten.breedte, h: gemeten.hoogte }).prijs;
  return Math.round((nieuw - oud) * aantal * 100) / 100;
}

/** Zet een datum en tijd uit een invoerveld (in Nederlandse tijd) om naar een tijdstip in UTC. */
export function amsterdamNaarIso(lokaal: string): string | null {
  const m = lokaal.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!m) return null;
  const [j, mnd, d, u, min] = m.slice(1).map(Number);
  const gok = Date.UTC(j, mnd - 1, d, u, min);
  const verschil = (t: number) => {
    const delen = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Amsterdam", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(t));
    const g = (type: string) => Number(delen.find((x) => x.type === type)!.value);
    return Date.UTC(g("year"), g("month") - 1, g("day"), g("hour"), g("minute")) - t;
  };
  let t = gok - verschil(gok);
  t = gok - verschil(t);
  const uit = new Date(t);
  return Number.isNaN(uit.getTime()) ? null : uit.toISOString();
}
