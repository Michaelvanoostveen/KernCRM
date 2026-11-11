import { isTeLaat, openstaand, type FactuurStatus } from "./bereken";
import { dagenTeLaat } from "./mail";

export interface OverzichtFactuur {
  id: string;
  nummer: string;
  projectId: string;
  projectNaam: string;
  klantNaam: string;
  termijn: number;
  totaal: number;
  vervaldatum: string;
  factuurdatum: string;
  status: FactuurStatus;
  verzonden: boolean;
  betaald: number;
  /** Wat via creditnota's van het factuurbedrag is afgehaald. */
  gecrediteerd: number;
}

export type Filter = "open" | "telaat" | "onverzonden" | "betaald" | "alle";
export const FILTERS: { sleutel: Filter; label: string }[] = [
  { sleutel: "open", label: "Open" },
  { sleutel: "telaat", label: "Te laat" },
  { sleutel: "onverzonden", label: "Nog niet verzonden" },
  { sleutel: "betaald", label: "Betaald" },
  { sleutel: "alle", label: "Alle" },
];
export const isFilter = (w: unknown): w is Filter => FILTERS.some((f) => f.sleutel === w);

export const openBedrag = (f: OverzichtFactuur) => openstaand(f.totaal, f.betaald > 0 ? [f.betaald] : [], f.gecrediteerd);

export function filterFacturen(lijst: OverzichtFactuur[], filter: Filter, vandaag: string): OverzichtFactuur[] {
  return lijst.filter((f) => {
    if (f.status === "geannuleerd" || f.status === "gecrediteerd") return filter === "alle";
    switch (filter) {
      case "open": return f.status === "open";
      case "telaat": return isTeLaat(f.status, f.vervaldatum, vandaag);
      case "onverzonden": return f.status === "open" && !f.verzonden;
      case "betaald": return f.status === "betaald";
      default: return true;
    }
  });
}

/** Totalen voor bovenaan het overzicht: wat staat open, wat is te laat, wat is dit jaar ontvangen en gefactureerd. */
export function samenvatting(lijst: OverzichtFactuur[], vandaag: string) {
  const actief = lijst.filter((f) => f.status !== "geannuleerd" && f.status !== "gecrediteerd");
  const open = actief.filter((f) => f.status === "open");
  const teLaat = open.filter((f) => isTeLaat(f.status, f.vervaldatum, vandaag));
  const som = (xs: number[]) => Math.round(xs.reduce((s, n) => s + Math.round(n * 100), 0)) / 100;
  return {
    aantalOpen: open.length,
    openstaand: som(open.map(openBedrag)),
    aantalTeLaat: teLaat.length,
    teLaat: som(teLaat.map(openBedrag)),
    gefactureerd: som(actief.map((f) => f.totaal - f.gecrediteerd)),
    ontvangen: som(actief.map((f) => f.betaald)),
  };
}

export const sorteerOpVervaldatum = (lijst: OverzichtFactuur[]) =>
  [...lijst].sort((a, b) => a.vervaldatum.localeCompare(b.vervaldatum) || a.nummer.localeCompare(b.nummer));

export const teLaatTekst = (f: OverzichtFactuur, vandaag: string) => {
  const d = dagenTeLaat(f.vervaldatum, vandaag);
  return d === 1 ? "1 dag te laat" : `${d} dagen te laat`;
};
