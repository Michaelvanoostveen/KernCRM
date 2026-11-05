"use server";

import { redirect } from "next/navigation";
import { maakServerClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Zet de toestemming "mag prijzen handmatig aanpassen" voor een gebruiker. Alleen de directie kan dit; de database dwingt dat af. */
export async function zetPrijsToestemming(formData: FormData) {
  const userId = String(formData.get("user_id") ?? "");
  if (!UUID.test(userId)) redirect("/instellingen/gebruikers");
  const aan = formData.get("waarde") === "aan";
  const supabase = await maakServerClient();
  const { data: ik } = await supabase.auth.getUser();
  const { data: lid } = await supabase.from("tenant_leden").select("tenant_id").eq("user_id", ik.user?.id ?? "").eq("rol", "directie").limit(1).maybeSingle();
  if (!lid) redirect("/instellingen/gebruikers?fout=rechten");
  const { error } = await supabase.from("tenant_leden").update({ mag_prijzen_aanpassen: aan }).eq("tenant_id", lid.tenant_id).eq("user_id", userId);
  redirect(error ? "/instellingen/gebruikers?fout=opslaan" : "/instellingen/gebruikers?gewijzigd=1");
}

/** Laadt de standaardcatalogus van KernKozijnen (97 artikelen) in het bedrijf van de directie. Bestaande artikelen blijven ongemoeid. */
export async function importeerCatalogus() {
  const supabase = await maakServerClient();
  const { data: ik } = await supabase.auth.getUser();
  const { data: lid } = await supabase.from("tenant_leden").select("tenant_id").eq("user_id", ik.user?.id ?? "").eq("rol", "directie").limit(1).maybeSingle();
  if (!lid) redirect("/instellingen/catalogus?fout=rechten");
  const { default: artikelen } = await import("@/lib/offerte/catalogus-kernkozijnen.json");
  const { error } = await supabase
    .from("artikelen")
    .upsert(artikelen.map((a) => ({ ...a, tenant_id: lid.tenant_id })), { onConflict: "tenant_id,code", ignoreDuplicates: true });
  if (error) console.error("catalogus importeren mislukt:", error.code, error.message);
  redirect(error ? "/instellingen/catalogus?fout=import" : "/instellingen/catalogus?geimporteerd=1");
}
