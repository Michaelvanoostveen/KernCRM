import { maakBoeking, type FactuurBron } from "./boeking";
import type { BoekhoudInstellingen } from "./instellingen";

export const BOEKINGEN_KOP = ["soort", "dagboek", "nummer", "datum", "vervaldatum", "klant", "omschrijving", "betreft_factuur", "project", "omzetrekening", "btwcode", "bedrag_excl", "btw", "totaal_incl_document", "status"];
export const BETALINGEN_KOP = ["factuurnummer", "klant", "betaald_op", "bedrag_incl_btw", "notitie"];

export type ExportBron = FactuurBron & { status: string };

/**
 * De rijen van de export "verkoopboekingen": één rij per boekregel (omzet per btw-tarief) van elke factuur en creditnota, op datum en nummer gesorteerd.
 * De kolom status laat zien waar het document nu staat (open, betaald, gecrediteerd, geannuleerd of creditnota), zodat de boekhouder weet wat hij importeert.
 */
export function boekingRijen(bronnen: ExportBron[], instellingen: BoekhoudInstellingen, tarief: { hoog: number; laag: number }): (string | number | null)[][] {
  return [...bronnen]
    .sort((a, b) => a.datum.localeCompare(b.datum) || a.nummer.localeCompare(b.nummer))
    .flatMap((b) => {
      const boeking = maakBoeking(b, instellingen, tarief);
      return boeking.regels.map((r) => [boeking.soort, boeking.dagboek, boeking.nummer, boeking.datum, boeking.vervaldatum, boeking.debiteurNaam, boeking.omschrijving, boeking.verwijstNaar, boeking.projectNummer, r.omzetrekening, r.btwcode, r.bedragExcl, r.btwBedrag, boeking.totaalIncl, b.status]);
    });
}
