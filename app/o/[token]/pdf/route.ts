import { maakAnoniemeClient } from "@/lib/supabase/anoniem";
import { maakOffertePdf, pdfBestandsnaam } from "@/lib/offerte/pdf/maak";
import { leesPubliekeOfferte } from "@/lib/offerte/publiek";
import { isGeldigeToken } from "@/lib/offerte/token";


/** De offerte als PDF voor de klant, via dezelfde geheime link en dezelfde gegevens als de online offerte. */
export async function GET(_verzoek: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!isGeldigeToken(token)) return new Response("Offerte niet gevonden.", { status: 404 });
  const { data } = await maakAnoniemeClient().rpc("offerte_publiek", { p_token: token });
  const offerte = leesPubliekeOfferte(data);
  if (!offerte) return new Response("Offerte niet gevonden.", { status: 404 });

  const pdf = await maakOffertePdf(offerte);
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${pdfBestandsnaam(offerte)}"`,
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}
