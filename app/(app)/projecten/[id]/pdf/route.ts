import { maakServerClient } from "@/lib/supabase/server";
import { maakAnoniemeClient } from "@/lib/supabase/anoniem";
import { maakOffertePdf, pdfBestandsnaam } from "@/lib/offerte/pdf/maak";
import { leesPubliekeOfferte } from "@/lib/offerte/publiek";


const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * De PDF van de verstuurde offerte voor de medewerker, om als bijlage te mailen.
 * Hij wordt gemaakt van precies dezelfde gegevens als de klant ziet, dus nooit met aanpassingen of redenen.
 */
export async function GET(_verzoek: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) return new Response("Project niet gevonden.", { status: 404 });

  const supabase = await maakServerClient();
  const { data: offerte } = await supabase.from("offertes").select("publiek_token").eq("project_id", id).order("versie", { ascending: false }).limit(1).maybeSingle();
  if (!offerte) return new Response("Project niet gevonden.", { status: 404 });
  if (!offerte.publiek_token) return new Response("De PDF is beschikbaar nadat de offerte is verstuurd.", { status: 409 });

  const { data } = await maakAnoniemeClient().rpc("offerte_publiek", { p_token: offerte.publiek_token });
  const publiek = leesPubliekeOfferte(data);
  if (!publiek) return new Response("Offerte niet gevonden.", { status: 404 });

  const pdf = await maakOffertePdf(publiek);
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${pdfBestandsnaam(publiek)}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
