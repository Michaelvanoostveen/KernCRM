export const FASEN = [
  { waarde: "lead", label: "Lead" },
  { waarde: "offerte", label: "Offerte" },
  { waarde: "akkoord", label: "Akkoord" },
  { waarde: "inmeting", label: "Inmeting" },
  { waarde: "bestelling", label: "Bestelling" },
  { waarde: "montage", label: "Montage" },
  { waarde: "oplevering", label: "Oplevering" },
  { waarde: "service", label: "Service" },
] as const;

export const FASE_LABELS: Record<string, string> = {
  ...Object.fromEntries(FASEN.map((f) => [f.waarde, f.label])),
  afgerond: "Afgerond",
  verloren: "Verloren",
};

export function faseLabel(fase: string): string {
  return FASE_LABELS[fase] ?? fase;
}

/** Positie van een fase in het stappenplan; -1 voor afgerond of verloren. */
export function faseIndex(fase: string): number {
  return FASEN.findIndex((f) => f.waarde === fase);
}
