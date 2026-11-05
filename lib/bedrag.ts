/**
 * Leest een bedrag uit een invoerveld. Met een komma is de punt een duizendtal ("1.250,50"); zonder komma is de punt het decimaalteken ("125.5").
 * Geeft null bij een leeg veld en NaN bij tekst die geen bedrag is.
 */
export function parseBedrag(tekst: string | null | undefined): number | null {
  const t = (tekst ?? "").trim().replace(/^€\s*/, "");
  if (t === "") return null;
  const n = Number(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : Number.NaN;
}
