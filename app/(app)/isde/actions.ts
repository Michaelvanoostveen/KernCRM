"use server";

import { redirect } from "next/navigation";
import { maakServerClient } from "@/lib/supabase/server";
import { parseBedrag } from "@/lib/bedrag";
import { isIsdeStatus } from "@/lib/isde";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const terug = (projectId: string, code: string): never => redirect(`/projecten/${projectId}?isde=${code}#isde`);

/** Zet de status van het ISDE-dossier van een project. */
export async function zetIsdeStatus(formData: FormData) {
  const projectId = String(formData.get("project_id") ?? "");
  if (!UUID.test(projectId)) redirect("/projecten");
  const status = String(formData.get("status") ?? "");
  const datum = String(formData.get("datum") ?? "");
  if (!isIsdeStatus(status) || (datum !== "" && !/^\d{4}-\d{2}-\d{2}$/.test(datum))) return terug(projectId, "ongeldig");
  const supabase = await maakServerClient();
  const { data, error } = await supabase.rpc("isde_status_zet", { p_project: projectId, p_status: status, p_referentie: String(formData.get("referentie") ?? "").slice(0, 80), p_notitie: String(formData.get("notitie") ?? "").slice(0, 2000), p_datum: datum === "" ? null : datum });
  if (error) {
    console.error("isde status mislukt:", error.code, error.message);
    return terug(projectId, "mislukt");
  }
  const uitkomst = data as { ok?: boolean; fout?: string } | null;
  return terug(projectId, uitkomst?.ok ? "status_bewaard" : uitkomst?.fout ?? "mislukt");
}

/** Bewaart de ISDE-gegevens van één positie: telt mee, U-waarde en m² glas. */
export async function bewaarIsdePositie(formData: FormData) {
  const projectId = String(formData.get("project_id") ?? "");
  const positieId = String(formData.get("positie_id") ?? "");
  if (!UUID.test(projectId)) redirect("/projecten");
  if (!UUID.test(positieId)) return terug(projectId, "ongeldig");
  const u = parseBedrag(String(formData.get("u_waarde") ?? ""));
  const m2 = parseBedrag(String(formData.get("glas_m2") ?? ""));
  if ((u !== null && (Number.isNaN(u) || u <= 0 || u > 6)) || (m2 !== null && (Number.isNaN(m2) || m2 < 0 || m2 > 999))) return terug(projectId, "ongeldig");
  const supabase = await maakServerClient();
  const { data, error } = await supabase.rpc("isde_positie_bewaar", { p_project: projectId, p_positie: positieId, p_in: formData.get("in_aanmerking") === "aan", p_u: u, p_m2: m2, p_notitie: String(formData.get("notitie") ?? "").slice(0, 500) });
  if (error) {
    console.error("isde positie mislukt:", error.code, error.message);
    return terug(projectId, "mislukt");
  }
  const uitkomst = data as { ok?: boolean; fout?: string } | null;
  return terug(projectId, uitkomst?.ok ? "positie_bewaard" : uitkomst?.fout ?? "mislukt");
}
