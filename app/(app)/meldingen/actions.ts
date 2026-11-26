"use server";

import { redirect } from "next/navigation";
import { maakServerClient } from "@/lib/supabase/server";

/** Markeert alle ongelezen meldingen van de ingelogde gebruiker als gelezen. */
export async function allesGelezen() {
  const supabase = await maakServerClient();
  const { error } = await supabase.rpc("meldingen_gelezen", { p_ids: null });
  if (error) console.error("meldingen markeren mislukt:", error.code, error.message);
  redirect("/meldingen");
}

/** Zet de e-mail bij een nieuwe melding aan of uit voor de ingelogde gebruiker (standaard aan). */
export async function zetMeldingMail(formData: FormData) {
  const supabase = await maakServerClient();
  const { data: lid } = await supabase.from("tenant_leden").select("tenant_id").limit(1).maybeSingle();
  if (lid) {
    const aan = formData.get("aan") === "ja";
    const { error } = await supabase.from("gebruiker_voorkeuren")
      .upsert({ tenant_id: lid.tenant_id, sleutel: "melding_mail", waarde: aan, bijgewerkt: new Date().toISOString() }, { onConflict: "user_id,tenant_id,sleutel" });
    if (error) console.error("voorkeur melding_mail:", error.code, error.message);
  }
  redirect("/meldingen");
}
