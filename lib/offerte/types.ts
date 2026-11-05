export type RegelSoort = "positie" | "artikel" | "kop" | "tekst" | "korting";
export type KortingModus = "percentage" | "bedrag";

/** Eén regel van een offerte. Prijzen zijn per stuk en incl. btw. */
export interface OfferteRegel {
  id: string;
  soort: RegelSoort;
  positieId?: string | null;
  titel?: string | null;
  tekst?: string | null;
  aantal: number;
  prijs: number;
  modus?: KortingModus | null;
  waarde?: number | null;
}

export interface Termijn {
  naam: string;
  pct: number;
  toelichting: string;
}

export interface Instellingen {
  btwHoog: number;
  btwLaag: number;
  /** Deel van het orderbedrag (excl. btw) waarover het hoge tarief geldt; de rest valt onder het lage tarief. */
  deelHoog: number;
  termijnen: Termijn[];
  /** Maximale korting in procent van het totaal van de offerte voor gewone gebruikers. */
  maxKortingGebruiker: number;
}

export interface Berekening {
  subtotaal: number;
  korting: number;
  kortingPct: number;
  totaal: number;
  exclBtw: number;
  btwHoog: number;
  btwLaag: number;
  termijnen: { naam: string; pct: number; toelichting: string; bedrag: number }[];
}
