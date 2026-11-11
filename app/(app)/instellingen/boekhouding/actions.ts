"use server";

import { redirect } from "next/navigation";
import { maakServerClient } from "@/lib/supabase/server";
import { INSTELLING_VELDEN, schrijfInstellingen, type BoekhoudInstellingen } from "@/lib/boekhouding/instellingen";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const terug = (code: string): never => redirect(`/instellingen/boekhouding?m=${code}`);

async function mijnBedrijf(rollen: string[]) {
  const supabase = await maakServerClient();
  const { data: lid } = await supabase.from("tenant_leden").select("tenant_id, rol").in("rol", rollen).limit(1).maybeSingle();
  return { supabase, tenantId: (lid?.tenant_id as string | undefined) ?? null };
}

/** Bewaart de boekhoudaansluiting en de instellingen. Alleen de directie. */
export async function bewaarBoekhouding(formData: FormData) {
  const { supabase, tenantId } = await mijnBedrijf(["directie"]);
  if (!tenantId) return terug("rechten");
  const provider = String(formData.get("provider") ?? "geen");
  if (provider !== "geen" && provider !== "twinfield") return terug("ongeldig");
  const velden: Partial<BoekhoudInstellingen> = {};
  for (const v of INSTELLING_VELDEN) velden[v.sleutel] = String(formData.get(v.sleutel) ?? "");
  const { data, error } = await supabase.rpc("boekhoud_koppeling_bewaar", { p_tenant: tenantId, p_provider: provider, p_actief: formData.get("actief") === "aan", p_instellingen: schrijfInstellingen(velden) });
  if (error) {
    console.error("boekhouding bewaren mislukt:", error.code, error.message);
    return terug("mislukt");
  }
  const uitkomst = data as { ok?: boolean; fout?: string } | null;
  return terug(uitkomst?.ok ? "bewaard" : uitkomst?.fout ?? "mislukt");
}

/** Zet de al verzonden facturen en de creditnota's in de wachtrij (bij het activeren van de aansluiting). */
export async function vulWachtrijAan() {
  const { supabase, tenantId } = await mijnBedrijf(["directie", "kantoor"]);
  if (!tenantId) return terug("rechten");
  const { data, error } = await supabase.rpc("boekhoud_wachtrij_aanvullen", { p_tenant: tenantId });
  if (error) {
    console.error("wachtrij aanvullen mislukt:", error.code, error.message);
    return terug("mislukt");
  }
  const uitkomst = data as { ok?: boolean; fout?: string } | null;
  return terug(uitkomst?.ok ? "aangevuld" : uitkomst?.fout ?? "mislukt");
}

/** Markeert een onderdeel van de wachtrij als verwerkt (na het importeren van de export) of overgeslagen. */
export async function markeerWachtrij(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!UUID.test(id) || (status !== "verwerkt" && status !== "overgeslagen")) return terug("ongeldig");
  const supabase = await maakServerClient();
  const { data } = await supabase.rpc("boekhoud_wachtrij_markeer", { p_id: id, p_status: status, p_extern_ref: String(formData.get("extern_ref") ?? "").slice(0, 100), p_fout: null });
  const uitkomst = data as { ok?: boolean; fout?: string } | null;
  return terug(uitkomst?.ok ? (status === "verwerkt" ? "verwerkt" : "overgeslagen") : uitkomst?.fout ?? "mislukt");
}
