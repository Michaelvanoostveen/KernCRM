import { createClient } from "@supabase/supabase-js";

/**
 * Client met de service-role-sleutel: omzeilt RLS en mag dus nooit naar een browser. Alleen voor serverhulpfuncties die één vaste, in de database
 * bewaakte functie aanroepen (zoals de meldingsmail); nooit voor vrije zoekopdrachten op basis van invoer van een bezoeker.
 * Geeft null als de sleutel niet is ingesteld.
 */
export function maakBeheerClient() {
  const sleutel = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!sleutel || !process.env.NEXT_PUBLIC_SUPABASE_URL) return null;
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, sleutel, { auth: { persistSession: false, autoRefreshToken: false } });
}
