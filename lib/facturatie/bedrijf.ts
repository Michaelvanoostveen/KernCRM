/**
 * Bedrijfsgegevens op de factuur. De lege plekken zijn bewust onmiskenbaar, zodat er niets met een verzonnen IBAN of nummer de deur uit gaat.
 * Later per bedrijf in te stellen in de database.
 */
export const BEDRIJF_FACTUUR = {
  naam: "KernKozijnen B.V.",
  plaats: "Hengelo",
  email: "info@kernkozijnen.nl",
  telefoon: "06-13500083",
  iban: "[IBAN invullen]",
  kvk: "[KvK-nummer invullen]",
  btwNummer: "[btw-nummer invullen]",
} as const;

/** Zijn alle gegevens ingevuld die een verstuurbare factuur nodig heeft? */
export const bedrijfsgegevensCompleet = (b: { iban: string; kvk: string; btwNummer: string } = BEDRIJF_FACTUUR) =>
  ![b.iban, b.kvk, b.btwNummer].some((v) => v.trim() === "" || v.includes("["));
