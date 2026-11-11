/** Eén veld voor een CSV die in Nederlandse Excel opent: puntkomma als scheiding, aanhalingstekens waar nodig. */
export function csvVeld(waarde: string | number | null | undefined): string {
  if (waarde === null || waarde === undefined) return "";
  const tekst = typeof waarde === "number" ? waarde.toFixed(2).replace(".", ",") : waarde;
  // Beschermt tegen formules in spreadsheets: een tekst die met = + - @ begint, krijgt een apostrof (getallen blijven ongemoeid).
  const veilig = typeof waarde === "string" && /^[=+\-@\t\r]/.test(tekst) ? `'${tekst}` : tekst;
  return /[";\n\r]/.test(veilig) ? `"${veilig.replace(/"/g, '""')}"` : veilig;
}

/** Bouwt een CSV (met BOM, zodat Excel de tekens goed leest) uit kopregel en rijen. */
export function maakCsv(kop: string[], rijen: (string | number | null | undefined)[][]): string {
  return "﻿" + [kop, ...rijen].map((r) => r.map(csvVeld).join(";")).join("\r\n") + "\r\n";
}
