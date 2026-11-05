"use server";

import { redirect } from "next/navigation";
import { maakServerClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATUM = /^\d{4}-\d{2}-\d{2}$/;
const HULPMIDDEL = ["geen", "steiger", "hoogwerker", "beide"];

const terug = (projectId: string, code: string): never => redirect(`/projecten/${projectId}?montage=${code}#montage`);

type Uitkomst = { ok?: boolean; fout?: string } | null;
const code = (u: Uitkomst, goed: string) => (u?.ok ? goed : u?.fout ?? "mislukt");

function lees(formData: FormData) {
  const ploeg = String(formData.get("ploeg_id") ?? "");
  const start = String(formData.get("start_datum") ?? "");
  const dagen = Math.round(Number(formData.get("werkdagen")));
  const lever = String(formData.get("leverdatum") ?? "");
  const hulp = String(formData.get("hulpmiddel") ?? "geen");
  const geldig = UUID.test(ploeg) && DATUM.test(start) && Number.isFinite(dagen) && dagen >= 1 && dagen <= 30 && (lever === "" || DATUM.test(lever)) && HULPMIDDEL.includes(hulp);
  return { geldig, ploeg, start, dagen, lever: lever === "" ? null : lever, hulp, notitie: String(formData.get("notitie") ?? "") };
}

/** Plant de montage van een project: ploeg, startdag, aantal werkdagen en (als bekend) de leverdatum van de kozijnen. */
export async function planMontage(formData: FormData) {
  const projectId = String(formData.get("project_id") ?? "");
  if (!UUID.test(projectId)) redirect("/projecten");
  const v = lees(formData);
  if (!v.geldig) return terug(projectId, "ongeldig");
  const supabase = await maakServerClient();
  const { data, error } = await supabase.rpc("plan_montage", { p_project: projectId, p_ploeg: v.ploeg, p_start: v.start, p_werkdagen: v.dagen, p_leverdatum: v.lever, p_hulpmiddel: v.hulp, p_notitie: v.notitie });
  if (error) { console.error("montage plannen mislukt:", error.code, error.message); return terug(projectId, "mislukt"); }
  return terug(projectId, code(data as Uitkomst, "gepland"));
}

export async function wijzigMontage(formData: FormData) {
  const projectId = String(formData.get("project_id") ?? "");
  const montageId = String(formData.get("montage_id") ?? "");
  if (!UUID.test(projectId)) redirect("/projecten");
  const v = lees(formData);
  if (!UUID.test(montageId) || !v.geldig) return terug(projectId, "ongeldig");
  const supabase = await maakServerClient();
  const { data, error } = await supabase.rpc("wijzig_montage", { p_montage: montageId, p_ploeg: v.ploeg, p_start: v.start, p_werkdagen: v.dagen, p_leverdatum: v.lever, p_hulpmiddel: v.hulp, p_notitie: v.notitie });
  if (error) { console.error("montage wijzigen mislukt:", error.code, error.message); return terug(projectId, "mislukt"); }
  return terug(projectId, code(data as Uitkomst, "gewijzigd"));
}

async function eenvoudig(formData: FormData, rpc: "start_montage" | "rond_montage_af", goed: string) {
  const projectId = String(formData.get("project_id") ?? "");
  const montageId = String(formData.get("montage_id") ?? "");
  if (!UUID.test(projectId)) redirect("/projecten");
  if (!UUID.test(montageId)) return terug(projectId, "ongeldig");
  const supabase = await maakServerClient();
  const { data } = await supabase.rpc(rpc, { p_montage: montageId });
  return terug(projectId, code(data as Uitkomst, goed));
}

/** De montage begint (kan pas op of na de startdag en als de leverdatum bekend is). */
export async function startMontage(formData: FormData) { return eenvoudig(formData, "start_montage", "gestart"); }

/** De montage is klaar; het project gaat naar de fase Oplevering. */
export async function rondMontageAf(formData: FormData) { return eenvoudig(formData, "rond_montage_af", "afgerond"); }

export async function annuleerMontage(formData: FormData) {
  const projectId = String(formData.get("project_id") ?? "");
  const montageId = String(formData.get("montage_id") ?? "");
  if (!UUID.test(projectId)) redirect("/projecten");
  if (!UUID.test(montageId)) return terug(projectId, "ongeldig");
  const supabase = await maakServerClient();
  const { data } = await supabase.rpc("annuleer_montage", { p_montage: montageId, p_reden: String(formData.get("reden") ?? "") });
  return terug(projectId, code(data as Uitkomst, "geannuleerd"));
}

/** Een nieuwe montageploeg toevoegen (directie en kantoor). */
export async function maakPloeg(formData: FormData) {
  const naam = String(formData.get("naam") ?? "").trim().slice(0, 60);
  if (naam.length === 0) redirect("/montage?ploeg=naam");
  const supabase = await maakServerClient();
  const { data: lid } = await supabase.from("tenant_leden").select("tenant_id, rol").in("rol", ["directie", "kantoor"]).limit(1).maybeSingle();
  if (!lid) redirect("/montage?ploeg=rechten");
  const { error } = await supabase.from("montageploegen").insert({ tenant_id: lid.tenant_id, naam });
  redirect(`/montage?ploeg=${error ? (error.code === "23505" ? "bestaat" : "mislukt") : "toegevoegd"}`);
}

/** Een ploeg uit of weer in dienst zetten. Bestaande montages blijven staan. */
export async function zetPloegActief(formData: FormData) {
  const id = String(formData.get("ploeg_id") ?? "");
  if (!UUID.test(id)) redirect("/montage");
  const supabase = await maakServerClient();
  const { error } = await supabase.from("montageploegen").update({ actief: formData.get("actief") === "aan" }).eq("id", id);
  redirect(`/montage?ploeg=${error ? "mislukt" : "bijgewerkt"}`);
}
