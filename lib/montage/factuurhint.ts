export interface MontageVoorFactuur { projectId: string; status: string; startDatum: string; eindDatum: string }
export interface FactuurVoorHint { projectId: string; termijn: number; status: string }

export interface FactuurActie {
  projectId: string;
  termijn: 2 | 3;
  reden: string;
}

/**
 * Welke termijnfactuur hoort nu klaar te staan?
 * - Termijn 2 (65%): op de eerste montagedag, zodra de montage definitief is en de factuur van termijn 1 bestaat.
 * - Termijn 3 (5%): zodra de montage is afgerond en de factuur van termijn 2 bestaat.
 * Er wordt niets automatisch aangemaakt: dit zijn aandachtspunten voor kantoor.
 */
export function factuurActies(montages: MontageVoorFactuur[], facturen: FactuurVoorHint[], vandaag: string): FactuurActie[] {
  const heeft = (projectId: string, termijn: number) => facturen.some((f) => f.projectId === projectId && f.termijn === termijn && f.status !== "geannuleerd" && f.status !== "gecrediteerd");
  const acties: FactuurActie[] = [];
  for (const m of montages) {
    if ((m.status === "definitief" || m.status === "bezig") && m.startDatum <= vandaag && heeft(m.projectId, 1) && !heeft(m.projectId, 2)) {
      acties.push({ projectId: m.projectId, termijn: 2, reden: m.startDatum === vandaag ? "De montage begint vandaag: factuur voor de levering (65%)." : "De montage is gestart: factuur voor de levering (65%) staat nog niet klaar." });
    }
    if (m.status === "afgerond" && heeft(m.projectId, 2) && !heeft(m.projectId, 3)) {
      acties.push({ projectId: m.projectId, termijn: 3, reden: "De montage is afgerond: eindfactuur (5%) kan worden gemaakt." });
    }
  }
  return acties;
}
