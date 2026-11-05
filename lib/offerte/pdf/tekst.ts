/** De standaardlettertypen in een PDF kennen niet alle tekens. Vervang wat ontbreekt door het dichtstbijzijnde teken. */
export function pdfTekst(t: string | null | undefined): string {
  return (t ?? "")
    .replaceAll("−", "-")      // minteken
    .replaceAll("‑", "-")      // vast koppelteken
    .replaceAll(" ", " ")      // dunne spatie
    .replaceAll(" ", " ") // smalle vaste spatie (door Intl in bedragen)
    .replaceAll("✓", "v")
    .replace(/[←-⇿☀-➿]/g, "");
}
