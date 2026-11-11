import { maakServerClient } from "@/lib/supabase/server";
import { leesMonteurDetail } from "@/lib/montage/monteur";
import { maakWerkbonPdf, type WerkbonPdfKozijn } from "@/lib/montage/pdf";
import { FOTO_BUCKET_WERKBON, kiesPdfFotos, leesWerkbon, werkbonBestandsnaam, type WerkbonFoto } from "@/lib/montage/werkbon";
import { haalRol } from "../../../start-gegevens";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const mm = (b: number | null | undefined, h: number | null | undefined) => (b != null && h != null ? `${b} × ${h} mm` : null);

/**
 * De werkbon van een montage als PDF, voor directie en kantoor: bijvoorbeeld om naar de klant te sturen als bewijs van de oplevering.
 * Na de oplevering staat de handtekening van de klant erin. Zonder prijzen.
 */
export async function GET(_verzoek: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) return new Response("Montage niet gevonden.", { status: 404 });
  const rol = await haalRol();
  if (rol !== "directie" && rol !== "kantoor") return new Response("Montage niet gevonden.", { status: 404 });

  const supabase = await maakServerClient();
  const [{ data: dData }, { data: wData }] = await Promise.all([supabase.rpc("monteur_detail", { p_montage: id }), supabase.rpc("werkbon_laad", { p_montage: id })]);
  const detail = leesMonteurDetail(dData);
  const werkbon = leesWerkbon(wData);
  if (!detail) return new Response("Montage niet gevonden.", { status: 404 });
  if (!werkbon) return new Response("Er is nog geen werkbon voor deze montage: de monteur moet de montage eerst starten.", { status: 409 });

  // Het handtekeningbeeld staat alleen in de tabel en is alleen voor directie en kantoor leesbaar.
  const { data: ak } = werkbon.status === "opgeleverd" ? await supabase.from("werkbon_akkoorden").select("handtekening").eq("werkbon_id", werkbon.id).maybeSingle() : { data: null };

  const keuze = kiesPdfFotos(werkbon.fotos, detail.posities.map((p) => p.positie_id));
  const haal = async (f: WerkbonFoto): Promise<Uint8Array | null> => {
    const { data, error } = await supabase.storage.from(FOTO_BUCKET_WERKBON).download(f.pad);
    if (error || !data) return null;
    return new Uint8Array(await data.arrayBuffer());
  };
  const alsLijst = async (lijst: WerkbonFoto[]) => (await Promise.all(lijst.map(haal))).filter((x): x is Uint8Array => x !== null);

  const kozijnen: WerkbonPdfKozijn[] = await Promise.all(detail.posities.map(async (p) => ({
    positieId: p.positie_id, nummer: p.nummer, ruimte: p.ruimte, aantal: p.aantal, config: p.config, gewijzigd: p.gewijzigd,
    maten: { bestel: mm(p.gemeten?.bestel_breedte_mm, p.gemeten?.bestel_hoogte_mm), binnen: mm(p.gemeten?.binnen_breedte_mm, p.gemeten?.binnen_hoogte_mm), buiten: mm(p.gemeten?.buiten_breedte_mm, p.gemeten?.buiten_hoogte_mm), opmerking: p.gemeten?.opmerking ?? null },
    regel: werkbon.regels.find((r) => r.positie_id === p.positie_id) ?? null,
    fotosNa: await alsLijst(keuze.perKozijn.get(p.positie_id) ?? []),
  })));
  const a = detail.adres;

  const pdf = await maakWerkbonPdf({
    werkbon, klantNaam: detail.klant_naam,
    adresRegels: a ? [`${a.straat} ${a.huisnummer}${a.toevoeging ? ` ${a.toevoeging}` : ""}`, `${a.postcode} ${a.plaats}`] : [],
    projectNummer: detail.project_nummer, projectNaam: detail.project_naam, ploeg: detail.ploeg, collegas: detail.collegas,
    startDatum: detail.start_datum, eindDatum: detail.eind_datum, kozijnen,
    extras: detail.extras.map((e) => ({ omschrijving: e.omschrijving, aantal: e.aantal, kozijn: e.positie_id })),
    puntFotos: await alsLijst(keuze.punten), handtekening: (ak?.handtekening as string | undefined) ?? null,
  });
  return new Response(new Uint8Array(pdf), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${werkbonBestandsnaam(detail.project_nummer)}"`, "Cache-Control": "private, no-store" },
  });
}
