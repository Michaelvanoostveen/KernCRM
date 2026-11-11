import { maakServerClient } from "@/lib/supabase/server";
import { maakBoeking, type FactuurBron } from "@/lib/boekhouding/boeking";
import { maakCsv } from "@/lib/boekhouding/csv";
import { leesInstellingen } from "@/lib/boekhouding/instellingen";
import { INSTELLINGEN_KERNKOZIJNEN as inst } from "@/lib/offerte/instellingen";
import { haalRol } from "../../../start-gegevens";

const DATUM = /^\d{4}-\d{2}-\d{2}$/;
type Deb = { naam?: string } | null;
type FRij = { nummer: string; factuurdatum: string; vervaldatum: string; omschrijving: string; bedrag_excl: number | string; btw_hoog: number | string; btw_laag: number | string; totaal_incl: number | string; debiteur: Deb; projecten: { nummer: string } | null };
type CRij = { nummer: string; datum: string; omschrijving: string; bedrag_excl: number | string; btw_hoog: number | string; btw_laag: number | string; totaal_incl: number | string; debiteur: Deb; projecten: { nummer: string } | null; facturen: { nummer: string } | null };

/** CSV-export voor de boekhouding, voor directie en kantoor: verkoopboekingen of ontvangen betalingen over een periode. */
export async function GET(verzoek: Request) {
  const rol = await haalRol();
  if (rol !== "directie" && rol !== "kantoor") return new Response("Niet gevonden.", { status: 404 });
  const url = new URL(verzoek.url);
  const van = url.searchParams.get("van") ?? "";
  const tot = url.searchParams.get("tot") ?? "";
  const soort = url.searchParams.get("soort") === "betalingen" ? "betalingen" : "boekingen";
  if (!DATUM.test(van) || !DATUM.test(tot) || van > tot) return new Response("Ongeldige periode.", { status: 400 });

  const supabase = await maakServerClient();
  let csv: string;
  if (soort === "betalingen") {
    const { data } = await supabase.from("factuur_betalingen").select("bedrag, betaald_op, notitie, facturen(nummer, debiteur)").gte("betaald_op", van).lte("betaald_op", tot).order("betaald_op").limit(5000);
    const rijen = (data ?? []) as unknown as { bedrag: number | string; betaald_op: string; notitie: string | null; facturen: { nummer: string; debiteur: Deb } | null }[];
    csv = maakCsv(["factuurnummer", "klant", "betaald_op", "bedrag_incl_btw", "notitie"], rijen.map((r) => [r.facturen?.nummer, r.facturen?.debiteur?.naam, r.betaald_op, Number(r.bedrag), r.notitie]));
  } else {
    const [{ data: kRij }, { data: fData }, { data: cData }] = await Promise.all([
      supabase.from("boekhoud_koppelingen").select("instellingen").maybeSingle(),
      supabase.from("facturen").select("nummer, factuurdatum, vervaldatum, omschrijving, bedrag_excl, btw_hoog, btw_laag, totaal_incl, debiteur, projecten(nummer)").not("verzonden_op", "is", null).neq("status", "geannuleerd").gte("factuurdatum", van).lte("factuurdatum", tot).order("factuurdatum").limit(5000),
      supabase.from("creditnotas").select("nummer, datum, omschrijving, bedrag_excl, btw_hoog, btw_laag, totaal_incl, debiteur, projecten(nummer), facturen(nummer)").not("verzonden_op", "is", null).gte("datum", van).lte("datum", tot).order("datum").limit(5000),
    ]);
    const instellingen = leesInstellingen((kRij as { instellingen: unknown } | null)?.instellingen);
    const bronnen: FactuurBron[] = [
      ...((fData ?? []) as unknown as FRij[]).map((f): FactuurBron => ({ soort: "factuur", nummer: f.nummer, datum: f.factuurdatum, vervaldatum: f.vervaldatum, omschrijving: f.omschrijving, bedragExcl: Number(f.bedrag_excl), btwHoog: Number(f.btw_hoog), btwLaag: Number(f.btw_laag), totaalIncl: Number(f.totaal_incl), debiteurNaam: f.debiteur?.naam ?? "", projectNummer: f.projecten?.nummer ?? "" })),
      ...((cData ?? []) as unknown as CRij[]).map((c): FactuurBron => ({ soort: "creditnota", nummer: c.nummer, datum: c.datum, vervaldatum: null, omschrijving: c.omschrijving, bedragExcl: Number(c.bedrag_excl), btwHoog: Number(c.btw_hoog), btwLaag: Number(c.btw_laag), totaalIncl: Number(c.totaal_incl), debiteurNaam: c.debiteur?.naam ?? "", projectNummer: c.projecten?.nummer ?? "", verwijstNaar: c.facturen?.nummer ?? null })),
    ].sort((a, b) => a.datum.localeCompare(b.datum) || a.nummer.localeCompare(b.nummer));
    const rijen = bronnen.flatMap((b) => {
      const boeking = maakBoeking(b, instellingen, { hoog: inst.btwHoog, laag: inst.btwLaag });
      return boeking.regels.map((r) => [boeking.soort, boeking.dagboek, boeking.nummer, boeking.datum, boeking.vervaldatum, boeking.debiteurNaam, boeking.omschrijving, boeking.verwijstNaar, boeking.projectNummer, r.omzetrekening, r.btwcode, r.bedragExcl, r.btwBedrag, boeking.totaalIncl]);
    });
    csv = maakCsv(["soort", "dagboek", "nummer", "datum", "vervaldatum", "klant", "omschrijving", "betreft_factuur", "project", "omzetrekening", "btwcode", "bedrag_excl", "btw", "totaal_incl_document"], rijen);
  }
  return new Response(csv, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="kerncrm-${soort}-${van}-${tot}.csv"`, "Cache-Control": "private, no-store" },
  });
}
