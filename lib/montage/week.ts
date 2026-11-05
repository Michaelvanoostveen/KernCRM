/** Datums zijn jjjj-mm-dd in Nederlandse tijd. We rekenen met UTC-middag om geen last te hebben van zomer- en wintertijd. */
const dag = (iso: string) => new Date(`${iso}T12:00:00Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);

export const vandaagIso = (nu: Date) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Amsterdam" }).format(nu);

export function plusDagen(datum: string, n: number): string {
  const d = dag(datum);
  d.setUTCDate(d.getUTCDate() + n);
  return iso(d);
}

/** ISO-weekdag: 1 = maandag, 7 = zondag. */
export function isoWeekdag(datum: string): number {
  const w = dag(datum).getUTCDay();
  return w === 0 ? 7 : w;
}

export const isWerkdag = (datum: string) => isoWeekdag(datum) < 6;

/** De maandag van de week waarin de datum valt. */
export function weekStart(datum: string): string {
  return plusDagen(datum, 1 - isoWeekdag(datum));
}

/** Maandag tot en met vrijdag van de week die op `maandag` begint. */
export const werkweek = (maandag: string) => [0, 1, 2, 3, 4].map((n) => plusDagen(maandag, n));

/** De eerstvolgende werkdag op of na de datum. */
export function eersteWerkdag(datum: string): string {
  let d = datum;
  while (!isWerkdag(d)) d = plusDagen(d, 1);
  return d;
}

/** Laatste werkdag van een montage die op een werkdag begint en `werkdagen` werkdagen duurt (zelfde regel als in de database). */
export function werkdagEind(start: string, werkdagen: number): string {
  if (!isWerkdag(start) || werkdagen < 1 || werkdagen > 30) throw new Error("Een montage begint op een werkdag en duurt 1 tot 30 werkdagen");
  let d = start;
  let n = 1;
  while (n < werkdagen) {
    d = plusDagen(d, 1);
    if (isWerkdag(d)) n++;
  }
  return d;
}

/** ISO-weeknummer van een datum, bijvoorbeeld 46. */
export function weekNummer(datum: string): number {
  const d = dag(datum);
  const donderdag = new Date(d);
  donderdag.setUTCDate(d.getUTCDate() + 4 - isoWeekdag(datum));
  const jaarStart = new Date(Date.UTC(donderdag.getUTCFullYear(), 0, 1));
  return Math.ceil(((donderdag.getTime() - jaarStart.getTime()) / 86_400_000 + 1) / 7);
}

export interface PlanbordMontage { id: string; ploegId: string; startDatum: string; eindDatum: string; status: string }

/** Staat de montage op deze dag op het planbord? Alleen lopende en afgeronde montages, geen geannuleerde. */
export const montageOpDag = (m: PlanbordMontage, datum: string) => m.status !== "geannuleerd" && m.startDatum <= datum && m.eindDatum >= datum;
