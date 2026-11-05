/** Wat de database teruggeeft voor een inmeetstaat. Bevat nooit prijzen. */
export interface InmetingDetail {
  id: string;
  status: "gepland" | "uitgevoerd" | "geannuleerd";
  gepland_op: string;
  notitie: string | null;
  project_id: string;
  project_nummer: string;
  project_naam: string;
  klant_naam: string;
  telefoon: string | null;
  mobiel: string | null;
  adres: { straat: string; huisnummer: string; toevoeging: string | null; postcode: string; plaats: string; bereikbaarheid: string | null; woningtype: string | null; bouwjaar: number | null } | null;
  posities: {
    positie_id: string;
    nummer: number;
    ruimte: string | null;
    aantal: number;
    config: unknown;
    gemeten: { breedte_mm: number | null; hoogte_mm: number | null; dag_breedte_mm: number | null; dag_hoogte_mm: number | null; opmerking: string | null } | null;
  }[];
}

export interface InmetingOverzichtRij {
  id: string;
  gepland_op: string;
  status: "gepland" | "uitgevoerd" | "geannuleerd";
  project_naam: string;
  project_nummer: string;
  klant_naam: string;
  plaats: string | null;
  adres: string | null;
  aantal_posities: number;
  ingevuld: number;
}

export function leesDetail(invoer: unknown): InmetingDetail | null {
  if (typeof invoer !== "object" || invoer === null) return null;
  const o = invoer as Record<string, unknown>;
  if (typeof o.id !== "string" || !Array.isArray(o.posities)) return null;
  return invoer as InmetingDetail;
}

export function leesOverzicht(invoer: unknown): InmetingOverzichtRij[] {
  return Array.isArray(invoer) ? (invoer as InmetingOverzichtRij[]) : [];
}
