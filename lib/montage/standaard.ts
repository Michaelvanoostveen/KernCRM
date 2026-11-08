/**
 * De startopstelling van KernKozijnen (november 2026): zeven monteurs en drie ploegen van twee. Eén monteur is reserve.
 * Dit is alleen een startpunt: de namen en de samenstelling zijn gewone gegevens die directie en kantoor zelf aanpassen.
 */
export const STANDAARD_MONTEURS = ["Frits", "Angelo", "Johan", "Sem", "Nykai", "Diger", "Jeremy"] as const;

export const STANDAARD_PLOEGEN: { naam: string; leden: readonly string[] }[] = [
  { naam: "Ploeg 1", leden: ["Frits", "Angelo"] },
  { naam: "Ploeg 2", leden: ["Johan", "Sem"] },
  { naam: "Ploeg 3", leden: ["Nykai", "Diger"] },
];

/** Schoont een ingevulde naam op: spaties weg, niet te lang, geen lege naam. */
export function schoonNaam(invoer: unknown, max = 60): string | null {
  const naam = String(invoer ?? "").replace(/\s+/g, " ").trim().slice(0, max);
  return naam.length > 0 ? naam : null;
}
