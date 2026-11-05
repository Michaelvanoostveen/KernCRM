/** Eén indeling van een product, bijvoorbeeld "Stolpraam". `mult` is de prijsfactor van die indeling. */
export interface Variant {
  key: string;
  label: string;
  mult: number;
  /** Vaktypes per kolom (sleutels uit `Prijsregels.vak`). */
  cols?: string[];
  stack?: string[];
  grid?: { r: number; c: number };
  stolp?: boolean;
  topLight?: boolean;
  bottomLight?: boolean;
  // Kenmerken voor de tekening van deuren, schuifpuien en tuindeuren
  blade?: string;
  top?: boolean;
  sideL?: boolean;
  sideR?: boolean;
  nL?: number;
  nR?: number;
  sideBorst?: boolean;
  panels?: number;
  hef?: boolean;
  leaves?: number;
  borst?: boolean;
  sidelights?: boolean;
}

export type Tekenwijze = "window" | "door" | "slider" | "french";

export interface Product {
  label: string;
  /** Verkoopprijs incl. btw bij de standaardmaat, Schüco, HR++, wit. */
  base: number;
  stdM2: number;
  perM2: number;
  kind: Tekenwijze;
  priceMax: number;
  wMin: number;
  wMax: number;
  hMin: number;
  hMax: number;
  wDef: number;
  hDef: number;
  indeling: string;
  variants: Variant[];
}

export interface Prijsregels {
  producten: Record<string, Product>;
  glas: Record<string, { label: string; mult: number; isdeLow: number; isdeHigh: number }>;
  kleuren: Record<string, { label: string; mult: number; frame: string; stroke: string }>;
  beslag: Record<string, { label: string; mult: number }>;
  binnen: Record<string, { label: string; mult: number }>;
  profielen: Record<string, { label: string; mult: number; levertijd: string }>;
  vak: Record<string, { label: string; kort: string; f: number }>;
  vakVolgorde: string[];
  vakDemping: number;
}

/** De keuzes voor één positie (kozijn). Maten in millimeters. */
export interface Configuratie {
  product: string;
  variant: string;
  w: number;
  h: number;
  glas: string;
  kleur: string;
  /** Andere kleur voor de vleugels; leeg of gelijk aan `kleur` betekent zelfde kleur. */
  kleurVleugel?: string | null;
  beslag: string;
  binnen: string;
  profiel: string;
  /** Aangepaste vaktypes per kolom; moet even lang zijn als `cols` van de variant. */
  cols?: string[] | null;
}

export interface Prijsberekening {
  /** Verkoopprijs incl. btw, afgerond op 10 euro. */
  prijs: number;
  m2: number;
  /** Prijs vóór het plafond en de afronding. */
  ruw: number;
  /** Basis plus meerprijs per m² boven de standaardmaat, vóór de factoren. */
  basis: number;
  factoren: { glas: number; kleur: number; beslag: number; indeling: number; binnen: number; profiel: number };
  /** Samengevoegd: alle factoren met elkaar vermenigvuldigd. */
  factor: number;
  plafondActief: boolean;
  isde: { laag: number; hoog: number };
  waarschuwingen: string[];
}
