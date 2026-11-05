import type { Configuratie, Prijsregels } from "../prijs/types";
import { leesConfiguratie, positieOmschrijving } from "../projecten/positie";
import { beschrijfWijziging, type Wijziging } from "./wijzigingen";

export interface PositieBron { id: string; nummer: number; ruimte: string | null; aantal: number; config: unknown }

export interface DefinitievePositie {
  positieId: string;
  nummer: number;
  ruimte: string | null;
  aantal: number;
  /** Het kozijn zoals in de getekende offerte. */
  was: string;
  /** Wat er verandert, bijvoorbeeld "kleur Wit → Antraciet; vak 1: draairaam". */
  wijziging: string;
  /** De configuratie waarop het kozijn wordt gemaakt; de basis voor tekening, bestelling en werkbon. */
  config: Configuratie;
  meerprijs: number;
}

export interface DefinitieveOpdracht {
  gewijzigd: DefinitievePositie[];
  extras: { id: string; omschrijving: string; aantal: number; positieNummer: number | null; meerprijs: number }[];
  /** Som van alle door de klant goedgekeurde wijzigingen en extra's, incl. btw. */
  meerwerk: number;
}

/**
 * Wat er daadwerkelijk wordt gemaakt: de getekende offerte plus de door de klant goedgekeurde wijzigingen en extra's.
 * De getekende offerte zelf blijft ongewijzigd; dit is een aanvulling erop.
 */
export function maakDefinitieveOpdracht(regels: Prijsregels, posities: PositieBron[], wijzigingen: Wijziging[]): DefinitieveOpdracht {
  const goedgekeurd = wijzigingen.filter((w) => w.status === "akkoord");
  const gewijzigd: DefinitievePositie[] = [];
  const extras: DefinitieveOpdracht["extras"] = [];

  for (const w of goedgekeurd) {
    const p = posities.find((x) => x.id === w.positie_id);
    if (w.soort === "extra") {
      extras.push({ id: w.id, omschrijving: w.omschrijving, aantal: w.aantal, positieNummer: p?.nummer ?? null, meerprijs: w.meerprijs });
      continue;
    }
    if (!p) continue;
    try {
      const oud = leesConfiguratie(p.config);
      const nieuw = leesConfiguratie(w.nieuwe_config);
      gewijzigd.push({ positieId: p.id, nummer: p.nummer, ruimte: p.ruimte, aantal: p.aantal, was: positieOmschrijving(regels, oud), wijziging: beschrijfWijziging(regels, oud, nieuw), config: nieuw, meerprijs: w.meerprijs });
    } catch {
      // Een onleesbare configuratie slaan we over; de wijziging blijft zichtbaar in de lijst hierboven.
    }
  }
  gewijzigd.sort((a, b) => a.nummer - b.nummer);
  const meerwerk = Math.round(goedgekeurd.reduce((s, w) => s + w.meerprijs, 0) * 100) / 100;
  return { gewijzigd, extras, meerwerk };
}
