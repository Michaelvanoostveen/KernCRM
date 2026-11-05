import { createClient } from "@supabase/supabase-js";

/** Client zonder sessie: gedraagt zich als een klant die niet is ingelogd, ook als er toevallig een medewerker in dezelfde browser is ingelogd. */
export function maakAnoniemeClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
