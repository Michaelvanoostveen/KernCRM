"use server";

import { redirect } from "next/navigation";
import { maakServerClient } from "@/lib/supabase/server";
import { amsterdamNaarIso } from "@/lib/inmeting/afwijking";

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

/** Bewaart de gemeten maten van één positie. Werkt voor de toegewezen inmeter en voor medewerkers; nooit met prijzen. */
export async function bewaarInmetingPositie(_vorige: PositieStatus, formData: FormData): Promise<PositieStatus> {
  const inmetingId = String(formData.get("inmeting_id") ?? "");
  const positieId = String(formData.get("positie_id") ?? "");
  if (!UUID.test(inmetingId) || !UUID.test(positieId)) return { fout: "Deze positie is niet gevonden." };
  const [breedte, hoogte, dagB, dagH] = [maat(formData.get("breedte")), maat(formData.get("hoogte")), maat(formData.get("dag_breedte")), maat(formData.get("dag_hoogte"))];
  if ([breedte, hoogte, dagB, dagH].some((n) => n !== null && Number.isNaN(n))) return { fout: "Vul de maten in als getallen, in millimeters." };
  if (breedte === null || hoogte === null) return { fout: "Vul minimaal de gemeten breedte en hoogte in." };

  const supabase = await maakServerClient();
  const { data, error } = await supabase.rpc("inmeting_bewaar_positie", {
    p_inmeting: inmetingId, p_positie: positieId, p_breedte: breedte, p_hoogte: hoogte, p_dag_breedte: dagB, p_dag_hoogte: dagH, p_opmerking: String(formData.get("opmerking") ?? ""),
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
