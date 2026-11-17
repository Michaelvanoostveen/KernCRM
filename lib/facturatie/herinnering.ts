import type { FactuurStatus } from "./bereken";

export type HerinneringBesluit = { ok: true; niveau: number } | { ok: false; fout: "niet_open" | "niet_verzonden" | "nog_niet_verlopen" | "geen_volgende" | "te_snel" };

const ZEVEN_DAGEN = 7 * 86_400_000;

/**
 * Mag er nu een herinnering voor deze factuur? Zelfde regels als in de database (registreer_herinnering): de factuur staat open en is
 * verzonden, de vervaldatum is verstreken, er zijn hooguit drie herinneringen en er zit minstens 7 dagen tussen. Zo weten we dit
 * voordat we een mail versturen, want een verstuurde mail is niet terug te halen.
 */
export function beoordeelHerinnering(i: {
  status: FactuurStatus; verzondenOp: string | null; vervaldatum: string; vandaag: string; nu: Date; herinneringen: { niveau: number; verstuurd_op: string }[];
}): HerinneringBesluit {
  if (i.status !== "open") return { ok: false, fout: "niet_open" };
  if (!i.verzondenOp) return { ok: false, fout: "niet_verzonden" };
  if (i.vervaldatum >= i.vandaag) return { ok: false, fout: "nog_niet_verlopen" };
  const laatste = [...i.herinneringen].sort((a, b) => b.niveau - a.niveau)[0];
  const niveau = (laatste?.niveau ?? 0) + 1;
  if (niveau > 3) return { ok: false, fout: "geen_volgende" };
  if (laatste && i.nu.getTime() - new Date(laatste.verstuurd_op).getTime() < ZEVEN_DAGEN) return { ok: false, fout: "te_snel" };
  return { ok: true, niveau };
}
