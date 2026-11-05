"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { maakServerClient } from "@/lib/supabase/server";
import { amsterdamNaarIso } from "@/lib/inmeting/afwijking";
import { leesDetail } from "@/lib/inmeting/types";
import { beschrijfWijziging, heeftWijziging, meerprijsConfiguratie, pasVoorstelToe } from "@/lib/inmeting/wijzigingen";
import { eersteIp, isGeldigeHandtekening } from "@/lib/offerte/handtekening";
import { PrijsFout } from "@/lib/prijs/berekenen";
import { haalPrijsregels } from "@/lib/prijs";
import { leesConfiguratie } from "@/lib/projecten/positie";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Plant de inmeting van een getekende offerte en zet het project in de fase Inmeting. */
export async function planInmeting(formData: FormData) {
  const projectId = String(formData.get("project_id") ?? "");
  if (!UUID.test(projectId)) redirect("/projecten");
  const terug = (fout: string) => redirect(`/projecten/${projectId}?fout=${fout}`);

  const inmeterId = String(formData.get("inmeter_id") ?? "");
  const moment = amsterdamNaarIso(String(formData.get("moment") ?? ""));
  if (!UUID.test(inmeterId)) terug("inmeter");
  if (!moment) terug("datum");
  const notitie = String(formData.get("notitie") ?? "").trim().slice(0, 1000) || null;

  const supabase = await maakServerClient();
  const { data: project } = await supabase.from("projecten").select("id, tenant_id").eq("id", projectId).maybeSingle();
  if (!project) redirect("/projecten");
  const { data: offerte } = await supabase.from("offertes").select("id, status").eq("project_id", projectId).order("versie", { ascending: false }).limit(1).maybeSingle();
  if (!offerte || offerte.status !== "akkoord") terug("inmeting");

  const { data: lopend } = await supabase.from("inmetingen").select("id").eq("project_id", projectId).eq("status", "gepland").limit(1).maybeSingle();
  if (lopend) terug("inmeting");

  const { error } = await supabase.from("inmetingen").insert({ tenant_id: project.tenant_id, project_id: projectId, offerte_id: offerte!.id, gepland_op: moment, inmeter_id: inmeterId, notitie });
  if (error) {
    console.error("inmeting plannen mislukt:", error.code, error.message);
    terug("inmeting");
  }
  await supabase.from("projecten").update({ fase: "inmeting", gewijzigd: new Date().toISOString() }).eq("id", projectId);
  redirect(`/projecten/${projectId}?inmeting=gepland`);
}

/** Annuleert een geplande inmeting; het project gaat terug naar de fase Akkoord. */
export async function annuleerInmeting(formData: FormData) {
  const projectId = String(formData.get("project_id") ?? "");
  const inmetingId = String(formData.get("inmeting_id") ?? "");
  if (!UUID.test(projectId) || !UUID.test(inmetingId)) redirect("/projecten");
  const supabase = await maakServerClient();
  const { data } = await supabase.from("inmetingen").update({ status: "geannuleerd", gewijzigd: new Date().toISOString() }).eq("id", inmetingId).eq("project_id", projectId).eq("status", "gepland").select("id");
  if (data?.length) await supabase.from("projecten").update({ fase: "akkoord", gewijzigd: new Date().toISOString() }).eq("id", projectId).eq("fase", "inmeting");
  redirect(`/projecten/${projectId}?inmeting=geannuleerd`);
}

export type PositieStatus = { fout?: string; opgeslagen?: boolean };

const maat = (v: FormDataEntryValue | null): number | null => {
  const t = String(v ?? "").trim().replace(",", ".");
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? Math.round(n) : NaN;
};

/** Bewaart de bestelmaat, binnenmaat en buitenmaat van één positie. Werkt voor de toegewezen inmeter en voor medewerkers; nooit met prijzen. */
export async function bewaarInmetingPositie(_vorige: PositieStatus, formData: FormData): Promise<PositieStatus> {
  const inmetingId = String(formData.get("inmeting_id") ?? "");
  const positieId = String(formData.get("positie_id") ?? "");
  if (!UUID.test(inmetingId) || !UUID.test(positieId)) return { fout: "Deze positie is niet gevonden." };
  const m = Object.fromEntries(["bestel_breedte", "bestel_hoogte", "binnen_breedte", "binnen_hoogte", "buiten_breedte", "buiten_hoogte"].map((k) => [k, maat(formData.get(k))]));
  if (Object.values(m).some((n) => n !== null && Number.isNaN(n))) return { fout: "Vul de maten in als getallen, in millimeters." };
  if (m.bestel_breedte === null || m.bestel_hoogte === null) return { fout: "Vul minimaal de bestelmaat in: breedte en hoogte." };

  const supabase = await maakServerClient();
  const { data, error } = await supabase.rpc("inmeting_bewaar_positie", {
    p_inmeting: inmetingId, p_positie: positieId, p_bestel_breedte: m.bestel_breedte, p_bestel_hoogte: m.bestel_hoogte, p_binnen_breedte: m.binnen_breedte, p_binnen_hoogte: m.binnen_hoogte,
    p_buiten_breedte: m.buiten_breedte, p_buiten_hoogte: m.buiten_hoogte, p_opmerking: String(formData.get("opmerking") ?? ""),
  });
  if (error) {
    console.error("inmeting bewaren mislukt:", error.code, error.message);
    return { fout: "Opslaan lukte niet. Probeer het opnieuw." };
  }
  const uitkomst = data as { ok?: boolean; fout?: string } | null;
  if (uitkomst?.ok) return { opgeslagen: true };
  const fouten: Record<string, string> = {
    maat: "Een maat moet tussen 100 en 10.000 mm liggen.",
    afgerond: "Deze inmeting is al afgerond.",
    geen_toegang: "Je hebt geen toegang tot deze inmeting.",
    positie: "Deze positie hoort niet bij deze inmeting.",
  };
  return { fout: fouten[uitkomst?.fout ?? ""] ?? "Opslaan lukte niet. Probeer het opnieuw." };
}

/** Rondt de inmeting af; kan alleen als bij elke positie de breedte en hoogte zijn ingevuld. */
export async function rondInmetingAf(formData: FormData) {
  const inmetingId = String(formData.get("inmeting_id") ?? "");
  if (!UUID.test(inmetingId)) redirect("/inmeting");
  const supabase = await maakServerClient();
  const { data } = await supabase.rpc("inmeting_afronden", { p_inmeting: inmetingId });
  const uitkomst = data as { ok?: boolean; fout?: string } | null;
  redirect(`/inmeting/${inmetingId}?${uitkomst?.ok ? "afgerond=1" : `fout=${uitkomst?.fout ?? "onbekend"}`}`);
}

export type WijzigingStatus = { fout?: string; opgeslagen?: boolean };

/** Leest het veld "eigen prijs": leeg betekent de berekende prijs; ongeldig geeft NaN. */
function eigenPrijs(formData: FormData): number | null {
  const t = String(formData.get("eigen_prijs") ?? "").trim();
  if (t === "") return null;
  // Met een komma is de punt een duizendtal ("1.250,50"); zonder komma is de punt het decimaalteken ("125.5").
  const n = Number(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : Number.NaN;
}

const WIJZIGING_FOUTEN: Record<string, string> = {
  afgerond: "Deze inmeting is al afgerond.",
  geen_toegang: "Je hebt geen toegang tot deze inmeting.",
  positie: "Deze positie hoort niet bij deze inmeting.",
  artikel: "Dit artikel is niet beschikbaar.",
  aantal: "Kies een aantal tussen 1 en 100.",
  ongeldig: "Deze wijziging kan niet worden opgeslagen.",
  naam: "Vul de volledige naam van de klant in.",
  geen_toestemming: "Je hebt geen toestemming om zelf een prijs in te voeren.",
  reden: "Vul bij een eigen prijs een reden in.",
  handtekening: "Laat de klant tekenen in het vak.",
  leeg: "Er zijn geen wijzigingen om akkoord op te geven.",
  gewijzigd: "De wijzigingen zijn aangepast sinds de klant ze zag. Controleer ze en laat de klant opnieuw tekenen.",
  al_akkoord: "Voor deze positie heeft de klant al akkoord gegeven op een wijziging.",
  te_veel: "Er zijn al te veel extra's toegevoegd aan deze inmeting.",
  niet_te_verwijderen: "Deze wijziging kan niet meer worden verwijderd.",
};
const wijzigingFout = (code?: string) => WIJZIGING_FOUTEN[code ?? ""] ?? "Opslaan lukte niet. Probeer het opnieuw.";

/**
 * Stelt een andere indeling, draairichting, kleur of glas voor een positie voor. De meerprijs rekent de server uit met de prijsmodule;
 * de maat, het beslag en het profiel blijven zoals in de offerte.
 */
export async function stelWijzigingVoor(_vorige: WijzigingStatus, formData: FormData): Promise<WijzigingStatus> {
  const inmetingId = String(formData.get("inmeting_id") ?? "");
  const positieId = String(formData.get("positie_id") ?? "");
  if (!UUID.test(inmetingId) || !UUID.test(positieId)) return { fout: "Deze positie is niet gevonden." };

  const supabase = await maakServerClient();
  const { data: detail } = await supabase.rpc("inmeting_detail", { p_inmeting: inmetingId });
  const d = leesDetail(detail);
  const positie = d?.posities.find((p) => p.positie_id === positieId);
  if (!d || !positie) return { fout: wijzigingFout("positie") };

  const eigen = eigenPrijs(formData);
  if (eigen !== null && Number.isNaN(eigen)) return { fout: "Vul de eigen prijs in als bedrag, bijvoorbeeld 125,00." };
  const reden = String(formData.get("reden") ?? "").trim().slice(0, 1000);
  let omschrijving: string;
  let nieuw;
  let meerprijs: number;
  try {
    const regels = haalPrijsregels();
    const oud = leesConfiguratie(positie.config);
    const cols = formData.getAll("col").map(String);
    nieuw = pasVoorstelToe(oud, {
      variant: String(formData.get("variant") ?? oud.variant),
      cols: cols.length ? cols : null,
      kleur: String(formData.get("kleur") ?? oud.kleur),
      kleurVleugel: String(formData.get("kleur_vleugel") ?? "") || null,
      glas: String(formData.get("glas") ?? oud.glas),
    });
    if (nieuw.kleurVleugel === nieuw.kleur) nieuw.kleurVleugel = null;
    if (!heeftWijziging(oud, nieuw)) return { fout: "Je hebt nog niets aangepast." };
    meerprijs = meerprijsConfiguratie(regels, oud, nieuw, positie.aantal);
    omschrijving = beschrijfWijziging(regels, oud, nieuw);
  } catch (e) {
    if (e instanceof PrijsFout) return { fout: e.message };
    throw e;
  }

  const { data, error } = await supabase.rpc("inmeting_stel_config_voor", {
    p_inmeting: inmetingId, p_positie: positieId, p_config: nieuw, p_omschrijving: omschrijving, p_meerprijs: meerprijs,
    p_eigen_prijs: eigen, p_reden: eigen === null ? null : reden,
  });
  if (error) {
    console.error("wijziging voorstellen mislukt:", error.code, error.message);
    return { fout: "Opslaan lukte niet. Probeer het opnieuw." };
  }
  const uitkomst = data as { ok?: boolean; fout?: string } | null;
  if (!uitkomst?.ok) return { fout: wijzigingFout(uitkomst?.fout) };
  revalidatePath(`/inmeting/${inmetingId}`);
  return { opgeslagen: true };
}

/** Voegt een artikel uit de catalogus toe; de prijs komt uit de catalogus. */
export async function voegExtraToe(_vorige: WijzigingStatus, formData: FormData): Promise<WijzigingStatus> {
  const inmetingId = String(formData.get("inmeting_id") ?? "");
  const artikelId = String(formData.get("artikel_id") ?? "");
  const positieId = String(formData.get("positie_id") ?? "");
  const aantal = Math.round(Number(String(formData.get("aantal") ?? "1").replace(",", ".")));
  if (!UUID.test(inmetingId) || !UUID.test(artikelId)) return { fout: "Kies een artikel." };
  if (positieId && !UUID.test(positieId)) return { fout: wijzigingFout("positie") };
  if (!Number.isFinite(aantal) || aantal < 1 || aantal > 100) return { fout: wijzigingFout("aantal") };
  const eigen = eigenPrijs(formData);
  if (eigen !== null && Number.isNaN(eigen)) return { fout: "Vul de eigen prijs in als bedrag, bijvoorbeeld 125,00." };
  const reden = String(formData.get("reden") ?? "").trim().slice(0, 1000);

  const supabase = await maakServerClient();
  const { data, error } = await supabase.rpc("inmeting_voeg_extra_toe", {
    p_inmeting: inmetingId, p_positie: positieId || null, p_artikel: artikelId, p_aantal: aantal,
    p_eigen_prijs: eigen, p_reden: eigen === null ? null : reden,
  });
  if (error) {
    console.error("extra toevoegen mislukt:", error.code, error.message);
    return { fout: "Toevoegen lukte niet. Probeer het opnieuw." };
  }
  const uitkomst = data as { ok?: boolean; fout?: string } | null;
  if (!uitkomst?.ok) return { fout: wijzigingFout(uitkomst?.fout) };
  revalidatePath(`/inmeting/${inmetingId}`);
  return { opgeslagen: true };
}

/** Haalt een voorstel weg zolang de klant er nog geen akkoord op heeft gegeven. */
export async function verwijderWijziging(formData: FormData) {
  const inmetingId = String(formData.get("inmeting_id") ?? "");
  const wijzigingId = String(formData.get("wijziging_id") ?? "");
  if (!UUID.test(inmetingId) || !UUID.test(wijzigingId)) redirect("/inmeting");
  const supabase = await maakServerClient();
  await supabase.rpc("inmeting_verwijder_wijziging", { p_inmeting: inmetingId, p_wijziging: wijzigingId });
  redirect(`/inmeting/${inmetingId}`);
}

/** Legt het akkoord van de klant ter plekke vast: naam, handtekening, tijdstip, IP-adres en apparaat. */
export async function geefKlantAkkoord(_vorige: WijzigingStatus, formData: FormData): Promise<WijzigingStatus> {
  const inmetingId = String(formData.get("inmeting_id") ?? "");
  if (!UUID.test(inmetingId)) return { fout: "Deze inmeting is niet gevonden." };
  const naam = String(formData.get("naam") ?? "").trim();
  if (naam.length < 3 || naam.length > 120) return { fout: wijzigingFout("naam") };
  const handtekening = formData.get("handtekening");
  if (!isGeldigeHandtekening(handtekening)) return { fout: wijzigingFout("handtekening") };
  const verwacht = Number(String(formData.get("verwacht_totaal") ?? "").replace(",", "."));
  if (!Number.isFinite(verwacht)) return { fout: wijzigingFout("gewijzigd") };
  if (formData.get("akkoord") !== "on") return { fout: "Vink aan dat de klant akkoord gaat met de wijzigingen en de meerprijs." };

  const h = await headers();
  const supabase = await maakServerClient();
  const { data, error } = await supabase.rpc("inmeting_wijzigingen_akkoord", {
    p_inmeting: inmetingId, p_naam: naam, p_handtekening: handtekening,
    p_ip: eersteIp(h.get("x-forwarded-for")) ?? eersteIp(h.get("x-real-ip")), p_user_agent: h.get("user-agent"),
    p_verwacht_totaal: verwacht,
  });
  if (error) {
    console.error("klantakkoord mislukt:", error.code, error.message);
    return { fout: "Het akkoord kon niet worden opgeslagen. Probeer het opnieuw." };
  }
  const uitkomst = data as { ok?: boolean; fout?: string } | null;
  if (!uitkomst?.ok) return { fout: wijzigingFout(uitkomst?.fout) };
  revalidatePath(`/inmeting/${inmetingId}`);
  return { opgeslagen: true };
}
