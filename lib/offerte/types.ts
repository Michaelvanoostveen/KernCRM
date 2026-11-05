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
  /** Handmatig overschreven prijs per stuk (incl. btw). Vervangt `prijs` in de berekening. */
  prijsOverride?: number | null;
  overrideReden?: string | null;
  artikelId?: string | null;
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
  /** Subtotaal met de prijzen zoals ze nu op de regels staan (inclusief handmatige regelprijzen). */
  subtotaal: number;
  /** Subtotaal met de berekende prijzen uit de configurator en de catalogus, zonder handmatige aanpassingen. */
  basisSubtotaal: number;
  korting: number;
  /** Korting uit kortingsregels, als percentage van het subtotaal. */
  kortingPct: number;
  /** Eigen totaalprijs min het totaal na korting; negatief is een verlaging. */
  aanpassing: number;
  /** Totale verlaging ten opzichte van de berekende prijs (kortingsregels, regelprijzen en totaalprijs), in procent. Hiervoor geldt de kortinggrens. */
  verlagingPct: number;
  totaal: number;
  exclBtw: number;
  btwHoog: number;
  btwLaag: number;
  termijnen: { naam: string; pct: number; toelichting: string; bedrag: number }[];
}
