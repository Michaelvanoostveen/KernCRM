import { createBrowserClient } from "@supabase/ssr";

/** Supabase-client voor in de browser, bijvoorbeeld om foto's rechtstreeks naar de opslag te sturen. Gebruikt de sessie van de ingelogde gebruiker. */
export function maakBrowserClient() {
  return createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!);
}
