export type AdresDelen = {
  straat: string;
  huisnummer: string;
  toevoeging: string | null;
  postcode: string;
  plaats: string;
};

export type WoningDelen = {
  bouwjaar: number | null;
  woningtype: string | null;
  bereikbaarheid: string | null;
  monument: boolean;
};

/**
 * Bouwt de rijen voor de tabel `adressen`. Alle rijen hebben precies dezelfde kolommen: bij een
 * bulk-insert vult Supabase ontbrekende kolommen met null, en `monument` mag niet null zijn.
 * Zonder apart factuuradres geldt het projectadres ook als factuuradres.
 */
export function maakAdresRijen(o: {
  tenantId: string;
  klantId: string;
  land: string;
  project: AdresDelen & WoningDelen;
  factuur: AdresDelen | null;
}) {
  const basis = { tenant_id: o.tenantId, klant_id: o.klantId, land: o.land };
  const zonderWoning: WoningDelen = { bouwjaar: null, woningtype: null, bereikbaarheid: null, monument: false };
  const { bouwjaar, woningtype, bereikbaarheid, monument, ...projectAdres } = o.project;
  return [
    { ...basis, soort: "project" as const, ...projectAdres, bouwjaar, woningtype, bereikbaarheid, monument },
    { ...basis, soort: "factuur" as const, ...(o.factuur ?? projectAdres), ...zonderWoning },
  ];
}
