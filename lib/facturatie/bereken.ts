import type { Instellingen } from "../offerte/types";

const cent = (euro: number) => Math.round(euro * 100);
const euro = (c: number) => c / 100;

export interface BtwSplitsing { exclBtw: number; btwHoog: number; btwLaag: number; totaal: number }

/**
 * Splitst een bedrag incl. btw in bedrag excl. btw en de twee btw-bedragen, volgens dezelfde regel als de offerte:
 * 70% van het bedrag excl. btw valt onder 21%, de rest onder 9%. Alles telt op de cent exact op tot het totaal.
 */
export function splitsBtw(totaalIncl: number, inst: Instellingen): BtwSplitsing {
  const totC = cent(totaalIncl);
  const factor = 1 + inst.btwHoog * inst.deelHoog + inst.btwLaag * (1 - inst.deelHoog);
  const exclC = Math.round(totC / factor);
  const hoogC = Math.round(exclC * inst.deelHoog * inst.btwHoog);
  const laagC = totC - exclC - hoogC;
  return { exclBtw: euro(exclC), btwHoog: euro(hoogC), btwLaag: euro(laagC), totaal: euro(totC) };
}

export interface FactuurTermijn {
  nr: number;
  naam: string;
  pct: number;
  /** Bedrag van de termijn volgens de getekende offerte, incl. btw. */
  bedragOfferte: number;
  /** Goedgekeurd meerwerk dat op deze termijn wordt meegefactureerd (alleen de laatste termijn), incl. btw. */
  meerwerk: number;
  /** Te factureren bedrag incl. btw. */
  bedrag: number;
}

/** Het factuurplan: de termijnen van de getekende offerte, met het goedgekeurde meerwerk bij de laatste termijn (eindfactuur). */
export function maakFactuurplan(termijnen: { naam: string; pct: number; bedrag: number }[], meerwerk: number): FactuurTermijn[] {
  return termijnen.map((t, i) => {
    const laatste = i === termijnen.length - 1;
    const mw = laatste ? Math.round(meerwerk * 100) / 100 : 0;
    return { nr: i + 1, naam: t.naam, pct: t.pct, bedragOfferte: t.bedrag, meerwerk: mw, bedrag: Math.round((t.bedrag + mw) * 100) / 100 };
  });
}

/** Betaaltermijn in dagen per termijn volgens de voorwaarden: aanbetaling binnen 3 dagen, bij levering dezelfde dag, eindfactuur binnen 3 dagen. */
export const BETAALDAGEN = [3, 0, 3] as const;
export const betaaldagen = (nr: number) => BETAALDAGEN[nr - 1] ?? 3;

/** Vervaldatum (jjjj-mm-dd) als factuurdatum plus een aantal dagen. */
export function vervaldatum(factuurdatum: string, dagen: number): string {
  const d = new Date(`${factuurdatum}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dagen);
  return d.toISOString().slice(0, 10);
}

/** Omschrijving en vriendelijke begeleidende tekst per termijn. */
export function factuurTeksten(nr: number, pct: number, heeftMeerwerk: boolean): { omschrijving: string; toelichting: string } {
  if (nr === 1) {
    return {
      omschrijving: `Aanbetaling ${pct}% van de opdracht`,
      toelichting: "Bedankt voor uw opdracht! Conform onze voorwaarden vragen wij u een aanbetaling van 30%. Wilt u deze binnen 3 dagen voldoen? Dan zorgen wij ervoor dat alles vlot in gang wordt gezet.",
    };
  }
  if (nr === 2) {
    return {
      omschrijving: `Termijn bij levering kozijnen, ${pct}% van de opdracht`,
      toelichting: "Vandaag worden uw nieuwe kozijnen geleverd en gaan we aan de slag met de montage. Conform onze voorwaarden vragen wij u het bedrag van deze termijn (65%) vandaag te voldoen. Alvast hartelijk bedankt!",
    };
  }
  return {
    omschrijving: heeftMeerwerk ? `Eindtermijn ${pct}% van de opdracht, inclusief meer- en minderwerk` : `Eindtermijn ${pct}% van de opdracht`,
    toelichting: heeftMeerwerk
      ? "Fijn dat alles is opgeleverd! Dit is de eindafrekening: de laatste 5% van de opdracht, inclusief het meer- of minderwerk waar u tijdens de inmeting akkoord op heeft gegeven. Wilt u dit bedrag binnen 3 dagen voldoen? Hartelijk dank!"
      : "Fijn dat alles is opgeleverd! Dit is de eindafrekening: de laatste 5% van de opdracht. Wilt u dit bedrag binnen 3 dagen voldoen? Hartelijk dank!",
  };
}

/** Begroeting zoals in de offertemail: "Beste heer Jansen,". Zonder aanhef: "Beste heer/mevrouw Jansen,". */
export function begroeting(aanhef: string | null | undefined, achternaam: string | null | undefined, klantNaam: string): string {
  const woord = aanhef === "dhr" ? "heer" : aanhef === "mevr" ? "mevrouw" : "heer/mevrouw";
  return `Beste ${woord} ${achternaam || klantNaam},`;
}

export type FactuurStatus = "open" | "betaald" | "geannuleerd";

/** Openstaand bedrag van een factuur na de betalingen tot nu toe. */
export function openstaand(totaal: number, betalingen: number[]): number {
  const betaaldC = betalingen.reduce((s, b) => s + cent(b), 0);
  return euro(Math.max(0, cent(totaal) - betaaldC));
}

/** Is de factuur over de vervaldatum en nog niet betaald? */
export function isTeLaat(status: FactuurStatus, vervaldatumIso: string, vandaag: string): boolean {
  return status === "open" && vervaldatumIso < vandaag;
}
