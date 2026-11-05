import { maakServerClient } from "@/lib/supabase/server";
import { berekenOfferte } from "@/lib/offerte/bereken";
import { INSTELLINGEN_KERNKOZIJNEN } from "@/lib/offerte/instellingen";
import { regelsUitDb, type RegelRij } from "@/lib/offerte/uit-db";
import type { Activiteit, OfferteStatus, StartItem } from "@/lib/dashboard/start";

type OfferteRij = {
  id: string; versie: number; status: OfferteStatus; verstuurd_op: string | null; geldig_tot: string | null; totaal_override: number | string | null;
  offerte_regels: RegelRij[];
};
type ProjectRij = {
  id: string; nummer: string; naam: string; fase: string; verkoper_id: string | null; gewijzigd: string;
  klanten: { naam: string } | null; offertes: OfferteRij[];
};
type Gebeurtenis = { offerte_id: string; soort: "verstuurd" | "geopend" | "akkoord"; op: string };

const ZEVEN_DAGEN = 7 * 86_400_000;

/** Haalt de projecten met hun laatste offerte op en berekent per project wat het startscherm nodig heeft. */
export async function laadStart(weergave: "mijn" | "alle", nu: Date) {
  const supabase = await maakServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  let query = supabase
    .from("projecten")
    .select("id, nummer, naam, fase, verkoper_id, gewijzigd, klanten(naam), offertes(id, versie, status, verstuurd_op, geldig_tot, totaal_override, offerte_regels(soort, aantal, prijs, prijs_override, korting_modus, korting_waarde, posities(prijs, aantal)))")
    .not("fase", "in", "(verloren,afgerond)")
    .order("gewijzigd", { ascending: false })
    .limit(300);
  if (weergave === "mijn" && user) query = query.eq("verkoper_id", user.id);
  const { data: projectData, error } = await query;

  const projecten = (projectData ?? []) as unknown as ProjectRij[];

  const sinds = new Date(nu.getTime() - 30 * 86_400_000).toISOString();
  const { data: gebData } = await supabase.from("offerte_gebeurtenissen").select("offerte_id, soort, op").in("soort", ["verstuurd", "geopend", "akkoord"]).gte("op", sinds).order("op", { ascending: false }).limit(500);
  const gebeurtenissen = (gebData ?? []) as Gebeurtenis[];

  const items: StartItem[] = [];
  const perOfferte = new Map<string, { projectId: string; naam: string; klantNaam: string }>();
  for (const p of projecten) {
    const offerte = [...p.offertes].sort((a, b) => b.versie - a.versie)[0];
    if (!offerte) continue;
    perOfferte.set(offerte.id, { projectId: p.id, naam: p.naam, klantNaam: p.klanten?.naam ?? "" });
    const regels = regelsUitDb(offerte.offerte_regels);
    const b = berekenOfferte(regels, INSTELLINGEN_KERNKOZIJNEN, { totaalOverride: offerte.totaal_override === null ? null : Number(offerte.totaal_override) });
    const mijn = gebeurtenissen.filter((g) => g.offerte_id === offerte.id);
    const geopend = mijn.filter((g) => g.soort === "geopend");
    items.push({
      projectId: p.id, nummer: p.nummer, naam: p.naam, klantNaam: p.klanten?.naam ?? "", fase: p.fase, verkoperId: p.verkoper_id, gewijzigd: p.gewijzigd,
      versie: offerte.versie, status: offerte.status, verstuurdOp: offerte.verstuurd_op, geldigTot: offerte.geldig_tot, totaal: b.totaal,
      aantalRegels: regels.filter((r) => r.soort === "positie" || r.soort === "artikel").length,
      geopend: geopend.length, laatstGeopend: geopend[0]?.op ?? null, akkoordOp: mijn.find((g) => g.soort === "akkoord")?.op ?? null,
    });
  }

  // Recente activiteit van de laatste week; de geopende keren per offerte tellen we samen.
  const activiteit: Activiteit[] = [];
  const geopendGeteld = new Set<string>();
  for (const g of gebeurtenissen) {
    const info = perOfferte.get(g.offerte_id);
    if (!info || nu.getTime() - new Date(g.op).getTime() > ZEVEN_DAGEN) continue;
    if (g.soort === "geopend") {
      if (geopendGeteld.has(g.offerte_id)) continue;
      geopendGeteld.add(g.offerte_id);
      const aantal = gebeurtenissen.filter((x) => x.offerte_id === g.offerte_id && x.soort === "geopend" && nu.getTime() - new Date(x.op).getTime() <= ZEVEN_DAGEN).length;
      activiteit.push({ offerteSleutel: g.offerte_id, ...info, soort: "geopend", op: g.op, aantal });
    } else {
      activiteit.push({ offerteSleutel: g.offerte_id, ...info, soort: g.soort, op: g.op, aantal: 1 });
    }
  }
  activiteit.sort((a, b) => new Date(b.op).getTime() - new Date(a.op).getTime());

  return { items, activiteit: activiteit.slice(0, 10), fout: !!error };
}

/** De rol van de ingelogde gebruiker, om de standaardweergave te kiezen. */
export async function haalRol(): Promise<string | null> {
  const supabase = await maakServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from("tenant_leden").select("rol").eq("user_id", user.id).limit(1).maybeSingle();
  return (data?.rol as string | undefined) ?? null;
}
