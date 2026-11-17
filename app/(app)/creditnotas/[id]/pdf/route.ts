import { maakServerClient } from "@/lib/supabase/server";
import { laadCreditnotaPdf } from "@/lib/facturatie/pdf-laden";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** De creditnota als PDF voor medewerkers met leesrechten. */
export async function GET(_verzoek: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) return new Response("Creditnota niet gevonden.", { status: 404 });
  const uit = await laadCreditnotaPdf(await maakServerClient(), id);
  if (!uit) return new Response("Creditnota niet gevonden.", { status: 404 });
  return new Response(new Uint8Array(uit.pdf), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${uit.bestandsnaam}"`, "Cache-Control": "private, no-store" },
  });
}
