import { maakServerClient } from "@/lib/supabase/server";
import { laadOffertePdf } from "@/lib/offerte/pdf/laden";


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

  const uit = await laadOffertePdf(offerte.publiek_token);
  if (!uit) return new Response("Offerte niet gevonden.", { status: 404 });
  return new Response(new Uint8Array(uit.pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${uit.bestandsnaam}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
