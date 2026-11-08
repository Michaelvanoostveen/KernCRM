import { NextResponse, type NextRequest } from "next/server";
import { maakServerClient } from "@/lib/supabase/server";

/**
 * Hier komt de link uit de herstelmail uit. We zetten hem om in een sessie en sturen door naar het scherm voor een nieuw wachtwoord.
 * - `token_hash`: de link uit de aangepaste mailtekst van Supabase. Werkt ook als de mail op een ander apparaat wordt geopend, bijvoorbeeld
 *   door kantoor voor een monteur.
 * - `code`: de standaardlink van Supabase; die werkt alleen in de browser waar het herstel is aangevraagd.
 */
export async function GET(verzoek: NextRequest) {
  const supabase = await maakServerClient();
  const tokenHash = verzoek.nextUrl.searchParams.get("token_hash");
  const code = verzoek.nextUrl.searchParams.get("code");
  let fout: { code?: string; message: string } | null = null;

  if (tokenHash && verzoek.nextUrl.searchParams.get("type") === "recovery") {
    ({ error: fout } = await supabase.auth.verifyOtp({ type: "recovery", token_hash: tokenHash }));
  } else if (code) {
    ({ error: fout } = await supabase.auth.exchangeCodeForSession(code));
  } else {
    fout = { message: "geen code" };
  }
  if (!fout) return NextResponse.redirect(new URL("/wachtwoord-instellen", verzoek.url));
  console.error("herstellink gebruiken mislukt:", fout.code, fout.message);
  return NextResponse.redirect(new URL("/login?fout=herstel_verlopen", verzoek.url));
}
