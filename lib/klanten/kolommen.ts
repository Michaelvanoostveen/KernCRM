import { adresTekst, persoonsnaam, typeLabel, type AdresRegel } from "./klant";

export type KlantAdres = AdresRegel & {
  soort: "project" | "factuur";
  woningtype?: string | null;
  bouwjaar?: number | null;
  bereikbaarheid?: string | null;
  monument?: boolean | null;
};

export type KlantRij = {
  id: string;
  naam: string;
  type: string;
  aanhef: string | null;
  voornaam: string | null;
  tussenvoegsel: string | null;
  achternaam: string | null;
  bedrijfsnaam: string | null;
  email: string | null;
  telefoon: string | null;
  mobiel: string | null;
  website: string | null;
  herkomst: string | null;
  aangemaakt: string;
  adressen: KlantAdres[];
};

export const projectadres = (k: Pick<KlantRij, "adressen">) =>
  k.adressen.find((a) => a.soort === "project") ?? k.adressen[0];

export type Kolom = { id: string; label: string; waarde: (k: KlantRij) => string };

/** Alle kolommen die in het overzicht gekozen kunnen worden. De volgorde hier is de volgorde in de tabel. */
export const KOLOMMEN: Kolom[] = [
  { id: "type", label: "Soort klant", waarde: (k) => typeLabel(k.type) },
  { id: "bedrijfsnaam", label: "Bedrijfsnaam", waarde: (k) => k.bedrijfsnaam ?? "" },
  { id: "contactpersoon", label: "Contactpersoon", waarde: (k) => persoonsnaam(k) },
  { id: "email", label: "E-mailadres", waarde: (k) => k.email ?? "" },
  { id: "telefoon", label: "Telefoon", waarde: (k) => k.telefoon ?? "" },
  { id: "mobiel", label: "Mobiel", waarde: (k) => k.mobiel ?? "" },
  { id: "adres", label: "Adres", waarde: (k) => { const a = projectadres(k); return a ? adresTekst(a) : ""; } },
  { id: "postcode", label: "Postcode", waarde: (k) => projectadres(k)?.postcode ?? "" },
  { id: "plaats", label: "Plaats", waarde: (k) => projectadres(k)?.plaats ?? "" },
  { id: "woningtype", label: "Type woning", waarde: (k) => projectadres(k)?.woningtype ?? "" },
  { id: "bouwjaar", label: "Bouwjaar", waarde: (k) => String(projectadres(k)?.bouwjaar ?? "") },
  { id: "bereikbaarheid", label: "Bereikbaarheid", waarde: (k) => projectadres(k)?.bereikbaarheid ?? "" },
  { id: "herkomst", label: "Herkomst", waarde: (k) => k.herkomst ?? "" },
  { id: "aangemaakt", label: "Aangemaakt", waarde: (k) => new Date(k.aangemaakt).toLocaleDateString("nl-NL") },
];

export const STANDAARD_KOLOMMEN = ["type", "plaats", "email", "telefoon"];

/** Houdt alleen bekende kolommen over, in vaste volgorde. Bij een lege of ongeldige keuze: de standaard. */
export function schoneKolommen(invoer: unknown): string[] {
  if (!Array.isArray(invoer)) return STANDAARD_KOLOMMEN;
  const gekozen = KOLOMMEN.filter((k) => invoer.includes(k.id)).map((k) => k.id);
  return gekozen.length ? gekozen : STANDAARD_KOLOMMEN;
}
