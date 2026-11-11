import { maakServerClient } from "@/lib/supabase/server";
import { begroeting } from "@/lib/facturatie/bereken";
import { creditnotaBestandsnaam, maakFactuurPdf } from "@/lib/facturatie/pdf";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** De creditnota als PDF voor medewerkers met leesrechten. */
export async function GET(_verzoek: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) return new Response("Creditnota niet gevonden.", { status: 404 });

  const supabase = await maakServerClient();
  const { data: c } = await supabase.from("creditnotas")
    .select("nummer, datum, omschrijving, bedrag_excl, btw_hoog, btw_laag, totaal_incl, debiteur, facturen(nummer), projecten(nummer, naam)")
    .eq("id", id).maybeSingle();
  if (!c) return new Response("Creditnota niet gevonden.", { status: 404 });

  const project = c.projecten as unknown as { nummer: string; naam: string } | null;
  const factuur = c.facturen as unknown as { nummer: string } | null;
  const debiteur = c.debiteur as { naam?: string; aanhef?: string | null; achternaam?: string | null; regels?: string[] } | null;
  const klantNaam = debiteur?.naam ?? "";

  const pdf = await maakFactuurPdf({
    soort: "creditnota", verwijstNaar: factuur?.nummer ?? "",
    nummer: c.nummer, factuurdatum: c.datum, vervaldatum: c.datum, omschrijving: c.omschrijving, toelichting: null,
    bedragExcl: Number(c.bedrag_excl), btwHoog: Number(c.btw_hoog), btwLaag: Number(c.btw_laag), totaal: Number(c.totaal_incl), meerwerk: 0,
    status: "open", projectNummer: project?.nummer ?? "", projectNaam: project?.naam ?? "", klantNaam,
    begroeting: begroeting(debiteur?.aanhef, debiteur?.achternaam, klantNaam),
    adresRegels: Array.isArray(debiteur?.regels) ? debiteur.regels.filter((r): r is string => typeof r === "string") : [],
  });
  return new Response(new Uint8Array(pdf), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${creditnotaBestandsnaam(c.nummer)}"`, "Cache-Control": "private, no-store" },
  });
}
