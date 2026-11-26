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
