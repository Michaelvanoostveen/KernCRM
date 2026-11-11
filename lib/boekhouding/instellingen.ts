/** De instellingen van de boekhoudaansluiting van een bedrijf. Geen geheimen: inloggegevens komen apart en versleuteld. */
export interface BoekhoudInstellingen {
  kantoorcode: string;
  dagboek: string;
  debiteurenrekening: string;
  omzetrekeningHoog: string;
  omzetrekeningLaag: string;
  btwcodeHoog: string;
  btwcodeLaag: string;
}

export const INSTELLING_VELDEN: { sleutel: keyof BoekhoudInstellingen; dbSleutel: string; label: string; hulp: string; standaard: string }[] = [
  { sleutel: "kantoorcode", dbSleutel: "kantoorcode", label: "Kantoorcode (administratie)", hulp: "De code van de administratie in Twinfield.", standaard: "" },
  { sleutel: "dagboek", dbSleutel: "dagboek", label: "Verkoopdagboek", hulp: "Meestal VRK.", standaard: "VRK" },
  { sleutel: "debiteurenrekening", dbSleutel: "debiteurenrekening", label: "Grootboekrekening debiteuren", hulp: "Bijvoorbeeld 1300.", standaard: "" },
  { sleutel: "omzetrekeningHoog", dbSleutel: "omzetrekening_hoog", label: "Omzetrekening (21% btw)", hulp: "Grootboekrekening voor de omzet met hoog tarief.", standaard: "" },
  { sleutel: "omzetrekeningLaag", dbSleutel: "omzetrekening_laag", label: "Omzetrekening (9% btw)", hulp: "Grootboekrekening voor de omzet met laag tarief.", standaard: "" },
  { sleutel: "btwcodeHoog", dbSleutel: "btwcode_hoog", label: "Btw-code hoog tarief", hulp: "De btw-code in Twinfield voor 21%.", standaard: "" },
  { sleutel: "btwcodeLaag", dbSleutel: "btwcode_laag", label: "Btw-code laag tarief", hulp: "De btw-code in Twinfield voor 9%.", standaard: "" },
];

/** Leest de instellingen uit de database (jsonb); ontbrekende velden worden leeg of de standaardwaarde. */
export function leesInstellingen(json: unknown): BoekhoudInstellingen {
  const o = (json && typeof json === "object" ? json : {}) as Record<string, unknown>;
  const uit = {} as BoekhoudInstellingen;
  for (const v of INSTELLING_VELDEN) uit[v.sleutel] = typeof o[v.dbSleutel] === "string" ? (o[v.dbSleutel] as string).trim() : v.standaard;
  return uit;
}

/** Zet de instellingen om naar het jsonb-object voor de database (lege waarden blijven weg). */
export function schrijfInstellingen(i: Partial<BoekhoudInstellingen>): Record<string, string> {
  const uit: Record<string, string> = {};
  for (const v of INSTELLING_VELDEN) {
    const w = (i[v.sleutel] ?? "").trim().slice(0, 40);
    if (w) uit[v.dbSleutel] = w;
  }
  return uit;
}

/** Welke instellingen moeten nog worden ingevuld voordat er geboekt kan worden? */
export function ontbrekendeInstellingen(i: BoekhoudInstellingen): string[] {
  return INSTELLING_VELDEN.filter((v) => !i[v.sleutel]).map((v) => v.label);
}
