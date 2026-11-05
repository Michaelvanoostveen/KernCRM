import type { Berekening, Instellingen, OfferteRegel } from "./types";

const cent = (euro: number) => Math.round(euro * 100);
const euro = (c: number) => c / 100;

/** Rekent een offerte door. Alle bedragen zijn op de cent afgerond en de onderdelen tellen exact op tot het totaal. */
export function berekenOfferte(regels: OfferteRegel[], inst: Instellingen, opties: { totaalOverride?: number | null } = {}): Berekening {
  let subC = 0;
  let basisC = 0;
  for (const r of regels) {
    if (r.soort !== "positie" && r.soort !== "artikel") continue;
    basisC += cent(r.aantal * r.prijs);
    subC += cent(r.aantal * (r.prijsOverride ?? r.prijs));
  }

  let kortC = 0;
  for (const r of regels) {
    if (r.soort !== "korting" || !r.waarde || r.waarde <= 0) continue;
    kortC += r.modus === "percentage" ? Math.round((subC * r.waarde) / 100) : cent(r.waarde);
  }
  kortC = Math.min(kortC, subC);

  const naKortingC = subC - kortC;
  const eigen = opties.totaalOverride;
  const totC = eigen !== null && eigen !== undefined && eigen >= 0 ? cent(eigen) : naKortingC;
  const verlagingC = Math.max(0, basisC - totC);
  // Het totaal is incl. btw: 70% van het bedrag excl. btw valt onder 21%, de rest onder 9%.
  const factor = 1 + inst.btwHoog * inst.deelHoog + inst.btwLaag * (1 - inst.deelHoog);
  const exclC = Math.round(totC / factor);
  const hoogC = Math.round(exclC * inst.deelHoog * inst.btwHoog);
  const laagC = totC - exclC - hoogC; // de rest, zodat alles exact optelt

  let rest = totC;
  const termijnen = inst.termijnen.map((t, i) => {
    const c = i === inst.termijnen.length - 1 ? rest : Math.round((totC * t.pct) / 100);
    rest -= c;
    return { naam: t.naam, pct: t.pct, toelichting: t.toelichting, bedrag: euro(c) };
  });

  return {
    subtotaal: euro(subC),
    basisSubtotaal: euro(basisC),
    korting: euro(kortC),
    kortingPct: subC ? (kortC / subC) * 100 : 0,
    aanpassing: euro(totC - naKortingC),
    verlagingPct: basisC ? (verlagingC / basisC) * 100 : 0,
    totaal: euro(totC),
    exclBtw: euro(exclC),
    btwHoog: euro(hoogC),
    btwLaag: euro(laagC),
    termijnen,
  };
}

/** Directie mag onbeperkt korting geven; andere gebruikers tot de grens uit de instellingen. */
export function kortingToegestaan(kortingPct: number, rol: string | null | undefined, inst: Instellingen): boolean {
  return rol === "directie" || kortingPct <= inst.maxKortingGebruiker + 1e-9;
}

export const euroTekst = (n: number, decimalen = 2) =>
  new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR", minimumFractionDigits: decimalen, maximumFractionDigits: decimalen }).format(n);
