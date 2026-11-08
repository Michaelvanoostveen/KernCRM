export interface MonteurOverzichtRij {
  id: string;
  status: "definitief" | "bezig" | "afgerond";
  start_datum: string;
  eind_datum: string;
  werkdagen: number;
  leverdatum: string | null;
  hulpmiddel: string;
  project_naam: string;
  project_nummer: string;
  klant_naam: string;
  adres: string | null;
  plaats: string | null;
  ploeg: string;
}

export interface MonteurDetail {
  id: string;
  status: string;
  start_datum: string;
  eind_datum: string;
  werkdagen: number;
  leverdatum: string | null;
  hulpmiddel: string;
  notitie: string | null;
  project_nummer: string;
  project_naam: string;
  klant_naam: string;
  telefoon: string | null;
  mobiel: string | null;
  adres: { straat: string; huisnummer: string; toevoeging: string | null; postcode: string; plaats: string; bereikbaarheid: string | null; woningtype: string | null; bouwjaar: number | null } | null;
  ploeg: string;
  collegas: string[];
  posities: {
    positie_id: string;
    nummer: number;
    ruimte: string | null;
    aantal: number;
    config: unknown;
    gewijzigd: boolean;
    gemeten: { bestel_breedte_mm: number | null; bestel_hoogte_mm: number | null; binnen_breedte_mm: number | null; binnen_hoogte_mm: number | null; buiten_breedte_mm: number | null; buiten_hoogte_mm: number | null; opmerking: string | null } | null;
  }[];
  extras: { omschrijving: string; aantal: number; positie_id: string | null }[];
}

export function leesMonteurOverzicht(invoer: unknown): MonteurOverzichtRij[] {
  return Array.isArray(invoer) ? (invoer.filter((r) => typeof r === "object" && r !== null && typeof (r as { id?: unknown }).id === "string") as MonteurOverzichtRij[]) : [];
}

export function leesMonteurDetail(invoer: unknown): MonteurDetail | null {
  if (typeof invoer !== "object" || invoer === null) return null;
  const o = invoer as Partial<MonteurDetail>;
  if (typeof o.id !== "string" || !Array.isArray(o.posities)) return null;
  return { ...(o as MonteurDetail), collegas: Array.isArray(o.collegas) ? o.collegas : [], extras: Array.isArray(o.extras) ? o.extras : [] };
}

/** Titel van een montage-dag voor de monteur: "Vandaag", "Morgen" of de datum. */
export function dagLabel(datum: string, vandaag: string): string {
  const d = (iso: string) => new Date(`${iso}T12:00:00Z`).getTime();
  const verschil = Math.round((d(datum) - d(vandaag)) / 86_400_000);
  if (verschil === 0) return "Vandaag";
  if (verschil === 1) return "Morgen";
  if (verschil === -1) return "Gisteren";
  return new Intl.DateTimeFormat("nl-NL", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Amsterdam" }).format(new Date(`${datum}T12:00:00Z`));
}
