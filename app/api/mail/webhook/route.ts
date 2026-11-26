import { maakAnoniemeClient } from "@/lib/supabase/anoniem";

/**
 * Ontvangt de meldingen van Resend (bezorgd, vertraagd, teruggekaatst, spamklacht). Deze route doet niets anders dan de melding, met de drie Svix-koppen, doorgeven aan
 * de databasefunctie mail_webhook_verwerk. Die controleert zelf de handtekening met het geheim dat alleen in de database staat; zonder geldige handtekening wordt niets opgeslagen.
 * Hij is openbaar bereikbaar (Resend logt niet in), zie proxy.ts.
 */
export async function POST(verzoek: Request) {
  const body = await verzoek.text();
  if (body.length > 100_000) return new Response("Te groot.", { status: 413 });
  const { data, error } = await maakAnoniemeClient().rpc("mail_webhook_verwerk", {
    p_body: body,
    p_svix_id: verzoek.headers.get("svix-id") ?? "",
    p_svix_timestamp: verzoek.headers.get("svix-timestamp") ?? "",
    p_svix_signature: verzoek.headers.get("svix-signature") ?? "",
  });
  if (error) {
    console.error("mail-webhook mislukt:", error.code, error.message);
    return new Response("Fout.", { status: 500 });
  }
  const uitkomst = data as { ok?: boolean; fout?: string } | null;
  if (uitkomst?.ok) return Response.json({ ok: true });
  // 503 zolang het geheim nog niet is ingesteld: Resend probeert het dan later opnieuw. Bij een ongeldige handtekening of een verlopen melding geen details teruggeven.
  if (uitkomst?.fout === "niet_ingesteld") return new Response("Nog niet ingesteld.", { status: 503 });
  return new Response("Ongeldig.", { status: 400 });
}
