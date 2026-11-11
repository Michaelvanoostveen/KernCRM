import type { SupabaseClient } from "@supabase/supabase-js";
import { berekenOfferte } from "@/lib/offerte/bereken";
import { INSTELLINGEN_KERNKOZIJNEN } from "@/lib/offerte/instellingen";
import { regelsUitDb, type RegelRij } from "@/lib/offerte/uit-db";
import { leesWijzigingen } from "@/lib/inmeting/wijzigingen";
import { maakFactuurplan, type FactuurTermijn } from "@/lib/facturatie/bereken";

export interface Factuurplan {
  offerteId: string;
  offerteStatus: string;
  offerteTotaal: number;
  plan: FactuurTermijn[];
  meerwerk: number;
  /** Er is nog een geplande inmeting: het meerwerk is dan nog niet definitief. */
  inmetingOpen: boolean;
}

/** Bepaalt het factuurplan van een project: de termijnen van de getekende offerte, met het goedgekeurde meerwerk bij de eindtermijn. */
export async function laadFactuurplan(supabase: SupabaseClient, projectId: string): Promise<Factuurplan | null> {
  const { data: offerte } = await supabase.from("offertes").select("id, status, totaal_override").eq("project_id", projectId).order("versie", { ascending: false }).limit(1).maybeSingle();
  if (!offerte) return null;
  const [{ data: rData }, { data: iData }] = await Promise.all([
    supabase.from("offerte_regels").select("soort, aantal, prijs, prijs_override, korting_modus, korting_waarde, posities(prijs, aantal)").eq("offerte_id", offerte.id),
    supabase.from("inmetingen").select("id, status").eq("offerte_id", offerte.id).neq("status", "geannuleerd"),
  ]);
  const berekening = berekenOfferte(regelsUitDb((rData ?? []) as unknown as RegelRij[]), INSTELLINGEN_KERNKOZIJNEN, {
    totaalOverride: offerte.totaal_override === null || offerte.totaal_override === undefined ? null : Number(offerte.totaal_override),
  });

  const inmetingen = (iData ?? []) as { id: string; status: string }[];
  let meerwerk = 0;
  // Meerwerk dat de monteur ter plekke heeft voorgesteld en de klant heeft getekend, telt ook mee.
  const { data: mwData } = await supabase.from("werkbon_meerwerk").select("meerprijs, werkbonnen!inner(montages!inner(offerte_id))").eq("status", "akkoord").eq("werkbonnen.montages.offerte_id", offerte.id);
  for (const x of (mwData ?? []) as { meerprijs: number | string }[]) meerwerk += Number(x.meerprijs);
  for (const i of inmetingen.filter((x) => x.status === "uitgevoerd")) {
    const { data } = await supabase.rpc("inmeting_wijzigingen_lijst", { p_inmeting: i.id });
    meerwerk += leesWijzigingen(data).filter((w) => w.status === "akkoord").reduce((s, w) => s + w.meerprijs, 0);
  }
  return {
    offerteId: offerte.id as string,
    offerteStatus: offerte.status as string,
    offerteTotaal: berekening.totaal,
    plan: maakFactuurplan(berekening.termijnen, Math.round(meerwerk * 100) / 100),
    meerwerk: Math.round(meerwerk * 100) / 100,
    inmetingOpen: inmetingen.some((x) => x.status === "gepland"),
  };
}
