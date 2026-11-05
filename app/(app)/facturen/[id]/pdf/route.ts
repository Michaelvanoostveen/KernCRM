import { maakServerClient } from "@/lib/supabase/server";
import { begroeting } from "@/lib/facturatie/bereken";
import { factuurBestandsnaam, maakFactuurPdf } from "@/lib/facturatie/pdf";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** De factuur als PDF voor medewerkers met leesrechten; zonder rechten bestaat de factuur voor je niet. */
export async function GET(_verzoek: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) return new Response("Factuur niet gevonden.", { status: 404 });

  const supabase = await maakServerClient();
  const { data: f } = await supabase.from("facturen")
    .select("nummer, factuurdatum, vervaldatum, omschrijving, toelichting, bedrag_excl, btw_hoog, btw_laag, totaal_incl, meerwerk, status, debiteur, projecten(nummer, naam)")
    .eq("id", id).maybeSingle();
  if (!f) return new Response("Factuur niet gevonden.", { status: 404 });

  // De klantgegevens zoals ze waren bij het aanmaken van de factuur, niet zoals ze nu in het klantbestand staan.
  const project = f.projecten as unknown as { nummer: string; naam: string } | null;
  const debiteur = f.debiteur as { naam?: string; aanhef?: string | null; achternaam?: string | null; regels?: string[] } | null;
  const klantNaam = debiteur?.naam ?? "";

  const pdf = await maakFactuurPdf({
    nummer: f.nummer, factuurdatum: f.factuurdatum, vervaldatum: f.vervaldatum, omschrijving: f.omschrijving, toelichting: f.toelichting,
    bedragExcl: Number(f.bedrag_excl), btwHoog: Number(f.btw_hoog), btwLaag: Number(f.btw_laag), totaal: Number(f.totaal_incl), meerwerk: Number(f.meerwerk),
    status: f.status, projectNummer: project?.nummer ?? "", projectNaam: project?.naam ?? "", klantNaam,
    begroeting: begroeting(debiteur?.aanhef, debiteur?.achternaam, klantNaam),
    adresRegels: Array.isArray(debiteur?.regels) ? debiteur.regels.filter((r): r is string => typeof r === "string") : [],
  });
  return new Response(new Uint8Array(pdf), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${factuurBestandsnaam(f.nummer)}"`, "Cache-Control": "private, no-store" },
  });
}
