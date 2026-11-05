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
