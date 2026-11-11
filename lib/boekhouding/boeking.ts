import type { BoekhoudInstellingen } from "./instellingen";

export interface FactuurBron {
  soort: "factuur" | "creditnota";
  nummer: string;
  datum: string;
  vervaldatum: string | null;
  omschrijving: string;
  bedragExcl: number;
  btwHoog: number;
  btwLaag: number;
  totaalIncl: number;
  debiteurNaam: string;
  projectNummer: string;
  /** Bij een creditnota: het nummer van de factuur waar hij bij hoort. */
  verwijstNaar?: string | null;
}

export interface BoekRegel { omzetrekening: string; btwcode: string; bedragExcl: number; btwBedrag: number }

/** Een verkoopboeking, neutraal van vorm: een aansluiting (zoals Twinfield) vertaalt dit naar zijn eigen formaat. Bij een creditnota zijn de bedragen negatief. */
export interface Boeking {
  soort: "factuur" | "creditnota";
  dagboek: string;
  kantoorcode: string;
  debiteurenrekening: string;
  nummer: string;
  datum: string;
  vervaldatum: string | null;
  debiteurNaam: string;
  omschrijving: string;
  verwijstNaar: string | null;
  projectNummer: string;
  regels: BoekRegel[];
  totaalIncl: number;
}

const cent = (n: number) => Math.round(n * 100);
const euro = (c: number) => c / 100;

/**
 * Maakt van een factuur of creditnota een boeking: de omzet verdeeld over het hoge en lage btw-tarief.
 * De basis van het hoge tarief volgt uit het btw-bedrag (btw / tarief), de rest valt onder het lage tarief,
 * zodat de bedragen op de cent kloppen met het document. Een regel zonder bedrag wordt weggelaten.
 */
export function maakBoeking(b: FactuurBron, inst: BoekhoudInstellingen, tarief: { hoog: number; laag: number }): Boeking {
  const teken = b.soort === "creditnota" ? -1 : 1;
  const exclC = cent(b.bedragExcl);
  const basisHoogC = Math.min(exclC, Math.round(cent(b.btwHoog) / tarief.hoog));
  const basisLaagC = exclC - basisHoogC;
  const regels: BoekRegel[] = [];
  if (basisHoogC !== 0 || b.btwHoog !== 0) regels.push({ omzetrekening: inst.omzetrekeningHoog, btwcode: inst.btwcodeHoog, bedragExcl: teken * euro(basisHoogC), btwBedrag: teken * b.btwHoog });
  if (basisLaagC !== 0 || b.btwLaag !== 0) regels.push({ omzetrekening: inst.omzetrekeningLaag, btwcode: inst.btwcodeLaag, bedragExcl: teken * euro(basisLaagC), btwBedrag: teken * b.btwLaag });
  return {
    soort: b.soort, dagboek: inst.dagboek, kantoorcode: inst.kantoorcode, debiteurenrekening: inst.debiteurenrekening,
    nummer: b.nummer, datum: b.datum, vervaldatum: b.soort === "factuur" ? b.vervaldatum : null, debiteurNaam: b.debiteurNaam,
    omschrijving: b.omschrijving, verwijstNaar: b.verwijstNaar ?? null, projectNummer: b.projectNummer, regels, totaalIncl: teken * b.totaalIncl,
  };
}

/** Controleert of een boeking intern klopt: de regels tellen op tot het totaal. */
export function boekingKlopt(b: Boeking): boolean {
  const som = b.regels.reduce((s, r) => s + cent(r.bedragExcl) + cent(r.btwBedrag), 0);
  return som === cent(b.totaalIncl);
}
