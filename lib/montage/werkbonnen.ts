export interface WerkbonRij {
  id: string;
  status: "open" | "opgeleverd";
  /** De monteur vraagt kantoor te reageren en kantoor heeft de melding nog niet gezien. */
  aandacht: boolean;
  openPunten: number;
  uren: number;
}

export const WERKBON_FILTERS = [
  { sleutel: "lopend", label: "Wordt ingevuld" },
  { sleutel: "aandacht", label: "Aandacht nodig" },
  { sleutel: "opgeleverd", label: "Opgeleverd" },
  { sleutel: "alle", label: "Alle" },
] as const;
export type WerkbonFilter = (typeof WERKBON_FILTERS)[number]["sleutel"];

export const isWerkbonFilter = (v: string | undefined): v is WerkbonFilter => WERKBON_FILTERS.some((f) => f.sleutel === v);

/** Aandacht nodig = de monteur wacht op kantoor, of er staan opleverpunten open. */
export function filterWerkbonnen<T extends WerkbonRij>(rijen: T[], filter: WerkbonFilter): T[] {
  switch (filter) {
    case "lopend": return rijen.filter((r) => r.status === "open");
    case "opgeleverd": return rijen.filter((r) => r.status === "opgeleverd");
    case "aandacht": return rijen.filter((r) => r.aandacht || r.openPunten > 0);
    default: return rijen;
  }
}
