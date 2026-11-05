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
    .select("nummer, factuurdatum, vervaldatum, omschrijving, toelichting, bedrag_excl, btw_hoog, btw_laag, totaal_incl, meerwerk, status, projecten(nummer, naam, klanten(id, naam, aanhef, achternaam))")
    .eq("id", id).maybeSingle();
  if (!f) return new Response("Factuur niet gevonden.", { status: 404 });

  const project = f.projecten as unknown as { nummer: string; naam: string; klanten: { id: string; naam: string; aanhef: string | null; achternaam: string | null } | null } | null;
  const klant = project?.klanten ?? null;
  const { data: adressen } = klant ? await supabase.from("adressen").select("soort, straat, huisnummer, toevoeging, postcode, plaats").eq("klant_id", klant.id) : { data: [] };
  const lijst = (adressen ?? []) as { soort: string; straat: string; huisnummer: string; toevoeging: string | null; postcode: string; plaats: string }[];
  const adres = lijst.find((a) => a.soort === "factuur") ?? lijst[0];

  const pdf = await maakFactuurPdf({
    nummer: f.nummer, factuurdatum: f.factuurdatum, vervaldatum: f.vervaldatum, omschrijving: f.omschrijving, toelichting: f.toelichting,
    bedragExcl: Number(f.bedrag_excl), btwHoog: Number(f.btw_hoog), btwLaag: Number(f.btw_laag), totaal: Number(f.totaal_incl), meerwerk: Number(f.meerwerk),
    status: f.status, projectNummer: project?.nummer ?? "", projectNaam: project?.naam ?? "", klantNaam: klant?.naam ?? "",
    begroeting: begroeting(klant?.aanhef, klant?.achternaam, klant?.naam ?? ""),
    adresRegels: adres ? [`${adres.straat} ${adres.huisnummer}${adres.toevoeging ? ` ${adres.toevoeging}` : ""}`, `${adres.postcode} ${adres.plaats}`] : [],
  });
  return new Response(new Uint8Array(pdf), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${factuurBestandsnaam(f.nummer)}"`, "Cache-Control": "private, no-store" },
  });
}
