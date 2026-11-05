export type Klanttype = "particulier" | "vve" | "aannemer" | "woningcorporatie" | "zakelijk";

export const KLANTTYPES: { waarde: Klanttype; label: string }[] = [
  { waarde: "particulier", label: "Particulier" },
  { waarde: "zakelijk", label: "Zakelijk" },
  { waarde: "vve", label: "VvE" },
  { waarde: "aannemer", label: "Aannemer" },
  { waarde: "woningcorporatie", label: "Woningcorporatie" },
];

export function isBedrijf(type: string): boolean {
  return type !== "particulier";
}

type NaamDelen = {
  type: string;
  bedrijfsnaam?: string | null;
  voornaam?: string | null;
  tussenvoegsel?: string | null;
  achternaam?: string | null;
};

/** Persoonsnaam als "Jan van Dijk". */
export function persoonsnaam(d: Pick<NaamDelen, "voornaam" | "tussenvoegsel" | "achternaam">): string {
  return [d.voornaam, d.tussenvoegsel, d.achternaam]
    .map((s) => (s ?? "").trim())
    .filter(Boolean)
    .join(" ");
}

/** De naam die in lijsten en op offertes staat: bedrijfsnaam bij een bedrijf, anders de persoonsnaam. */
export function weergavenaam(d: NaamDelen): string {
  const bedrijf = (d.bedrijfsnaam ?? "").trim();
  if (isBedrijf(d.type) && bedrijf) return bedrijf;
  return persoonsnaam(d) || bedrijf;
}

/** "7551ab" of "7551 AB" wordt "7551 AB". Geeft null bij een ongeldige Nederlandse postcode. */
export function normaliseerPostcode(invoer: string): string | null {
  const m = invoer.trim().toUpperCase().match(/^([1-9][0-9]{3})\s?([A-Z]{2})$/);
  return m ? `${m[1]} ${m[2]}` : null;
}

/** Splitst "12a" in { huisnummer: "12", toevoeging: "a" }. */
export function splitsHuisnummer(invoer: string): { huisnummer: string; toevoeging: string } {
  const m = invoer.trim().match(/^(\d+)\s*[-\s]?\s*(.*)$/);
  return m ? { huisnummer: m[1], toevoeging: m[2].trim() } : { huisnummer: invoer.trim(), toevoeging: "" };
}

const LANDEN: Record<string, string> = { NL: "Nederland", BE: "België", DE: "Duitsland" };

export type AdresRegel = {
  straat: string;
  huisnummer: string;
  toevoeging?: string | null;
  postcode: string;
  plaats: string;
  land?: string | null;
};

/** "Vijverlaan 5a, 7547 AB Aadorp" (met landnaam als het niet Nederland is). */
export function adresTekst(a: AdresRegel): string {
  const nummer = [a.huisnummer, a.toevoeging].filter(Boolean).join(" ");
  const basis = `${a.straat} ${nummer}, ${a.postcode} ${a.plaats}`;
  return a.land && a.land !== "NL" ? `${basis}, ${LANDEN[a.land] ?? a.land}` : basis;
}

export function typeLabel(type: string): string {
  return KLANTTYPES.find((t) => t.waarde === type)?.label ?? type;
}
