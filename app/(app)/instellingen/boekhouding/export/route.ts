import { maakServerClient } from "@/lib/supabase/server";
import type { FactuurBron } from "@/lib/boekhouding/boeking";
import { BETALINGEN_KOP, BOEKINGEN_KOP, boekingRijen, type ExportBron } from "@/lib/boekhouding/export";
import { maakCsv } from "@/lib/boekhouding/csv";
import { leesInstellingen } from "@/lib/boekhouding/instellingen";
import { INSTELLINGEN_KERNKOZIJNEN as inst } from "@/lib/offerte/instellingen";
import { haalRol } from "../../../start-gegevens";

const DATUM = /^\d{4}-\d{2}-\d{2}$/;
type Deb = { naam?: string } | null;
type FRij = { nummer: string; status: string; factuurdatum: string; vervaldatum: string; omschrijving: string; bedrag_excl: number | string; btw_hoog: number | string; btw_laag: number | string; totaal_incl: number | string; debiteur: Deb; projecten: { nummer: string } | null };
type CRij = { nummer: string; factuur_id?: string; datum: string; omschrijving: string; bedrag_excl: number | string; btw_hoog: number | string; btw_laag: number | string; totaal_incl: number | string; debiteur: Deb; projecten: { nummer: string } | null; facturen: { nummer: string } | null };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_SELECTIE = 500;

type Verzoek = { soort: "boekingen" | "betalingen"; van: string; tot: string; ids: string[] | null };

async function maakExport(v: Verzoek): Promise<Response> {
  const rol = await haalRol();
  if (rol !== "directie" && rol !== "kantoor") return new Response("Niet gevonden.", { status: 404 });
  const supabase = await maakServerClient();
  let csv: string;
  let naam: string;
  if (v.soort === "betalingen") {
    let q = supabase.from("factuur_betalingen").select("bedrag, betaald_op, notitie, facturen(nummer, debiteur)").order("betaald_op").limit(5000);
    q = v.ids ? q.in("factuur_id", v.ids) : q.gte("betaald_op", v.van).lte("betaald_op", v.tot);
    const { data } = await q;
    const rijen = (data ?? []) as unknown as { bedrag: number | string; betaald_op: string; notitie: string | null; facturen: { nummer: string; debiteur: Deb } | null }[];
    // Terugbetalingen aan de klant staan er als negatieve bedragen bij, zodat de bankboekingen kloppen.
    let tq = supabase.from("factuur_terugbetalingen").select("bedrag, betaald_op, notitie, facturen(nummer, debiteur)").order("betaald_op").limit(5000);
    tq = v.ids ? tq.in("factuur_id", v.ids) : tq.gte("betaald_op", v.van).lte("betaald_op", v.tot);
    const { data: tData } = await tq;
    const terug = (tData ?? []) as unknown as typeof rijen;
    csv = maakCsv(BETALINGEN_KOP, [
      ...rijen.map((r) => [r.facturen?.nummer, r.facturen?.debiteur?.naam, r.betaald_op, Number(r.bedrag), r.notitie]),
      ...terug.map((r) => [r.facturen?.nummer, r.facturen?.debiteur?.naam, r.betaald_op, -Number(r.bedrag), r.notitie ? `Terugbetaling: ${r.notitie}` : "Terugbetaling"]),
    ].sort((x, y) => String(x[2]).localeCompare(String(y[2]))));
    naam = v.ids ? "selectie-betalingen" : `betalingen-${v.van}-${v.tot}`;
  } else {
    let fq = supabase.from("facturen").select("nummer, status, factuurdatum, vervaldatum, omschrijving, bedrag_excl, btw_hoog, btw_laag, totaal_incl, debiteur, projecten(nummer)").order("factuurdatum").limit(5000);
    // Een periode-export bevat alleen verzonden, niet-geannuleerde facturen; wat je zelf selecteert, krijg je (behalve geannuleerde) ook als het nog niet is verzonden.
    fq = v.ids ? fq.in("id", v.ids).neq("status", "geannuleerd") : fq.not("verzonden_op", "is", null).neq("status", "geannuleerd").gte("factuurdatum", v.van).lte("factuurdatum", v.tot);
    let cq = supabase.from("creditnotas").select("nummer, datum, omschrijving, bedrag_excl, btw_hoog, btw_laag, totaal_incl, debiteur, projecten(nummer), facturen(nummer)").not("verzonden_op", "is", null).order("datum").limit(5000);
    cq = v.ids ? cq.in("factuur_id", v.ids) : cq.gte("datum", v.van).lte("datum", v.tot);
    const [{ data: kRij }, { data: fData }, { data: cData }] = await Promise.all([supabase.from("boekhoud_koppelingen").select("instellingen").maybeSingle(), fq, cq]);
    const instellingen = leesInstellingen((kRij as { instellingen: unknown } | null)?.instellingen);
    const bronnen: ExportBron[] = [
      ...((fData ?? []) as unknown as FRij[]).map((f): ExportBron => ({ soort: "factuur", status: f.status, nummer: f.nummer, datum: f.factuurdatum, vervaldatum: f.vervaldatum, omschrijving: f.omschrijving, bedragExcl: Number(f.bedrag_excl), btwHoog: Number(f.btw_hoog), btwLaag: Number(f.btw_laag), totaalIncl: Number(f.totaal_incl), debiteurNaam: f.debiteur?.naam ?? "", projectNummer: f.projecten?.nummer ?? "" } satisfies FactuurBron & { status: string })),
      ...((cData ?? []) as unknown as CRij[]).map((c): ExportBron => ({ soort: "creditnota", status: "creditnota", nummer: c.nummer, datum: c.datum, vervaldatum: null, omschrijving: c.omschrijving, bedragExcl: Number(c.bedrag_excl), btwHoog: Number(c.btw_hoog), btwLaag: Number(c.btw_laag), totaalIncl: Number(c.totaal_incl), debiteurNaam: c.debiteur?.naam ?? "", projectNummer: c.projecten?.nummer ?? "", verwijstNaar: c.facturen?.nummer ?? null })),
    ];
    csv = maakCsv(BOEKINGEN_KOP, boekingRijen(bronnen, instellingen, { hoog: inst.btwHoog, laag: inst.btwLaag }));
    naam = v.ids ? "selectie-boekingen" : `boekingen-${v.van}-${v.tot}`;
  }
  return new Response(csv, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="kerncrm-${naam}.csv"`, "Cache-Control": "private, no-store" },
  });
}

/** CSV-export voor de boekhouding, voor directie en kantoor: verkoopboekingen of ontvangen betalingen over een periode. */
export async function GET(verzoek: Request) {
  const url = new URL(verzoek.url);
  const van = url.searchParams.get("van") ?? "";
  const tot = url.searchParams.get("tot") ?? "";
  const soort = url.searchParams.get("soort") === "betalingen" ? "betalingen" : "boekingen";
  if (!DATUM.test(van) || !DATUM.test(tot) || van > tot) return new Response("Ongeldige periode.", { status: 400 });
  return maakExport({ soort, van, tot, ids: null });
}

/** CSV-export van de facturen die op het overzicht zijn aangevinkt (met hun creditnota's, of hun betalingen). */
export async function POST(verzoek: Request) {
  const form = await verzoek.formData();
  const ids = [...new Set(form.getAll("id").map(String))];
  if (ids.length === 0 || ids.length > MAX_SELECTIE || ids.some((id) => !UUID.test(id))) return new Response("Selecteer één tot 500 facturen.", { status: 400 });
  return maakExport({ soort: form.get("soort") === "betalingen" ? "betalingen" : "boekingen", van: "", tot: "", ids });
}
