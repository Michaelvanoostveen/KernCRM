import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { maakServerClient } from "@/lib/supabase/server";
import { euroTekst } from "@/lib/offerte/bereken";
import { FILTERS, filterFacturen, isFilter, samenvatting, sorteerOpVervaldatum, teLaatTekst, openBedrag, type Filter, type OverzichtFactuur } from "@/lib/facturatie/overzicht";
import { isTeLaat, type FactuurStatus } from "@/lib/facturatie/bereken";
import { haalRol } from "../start-gegevens";

type Rij = {
  id: string; nummer: string; termijn: number; totaal_incl: number | string; vervaldatum: string; factuurdatum: string; status: FactuurStatus;
  verzonden_op: string | null; debiteur: { naam?: string } | null; projecten: { id: string; naam: string } | null;
};

const datum = (iso: string) => new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Amsterdam" }).format(new Date(`${iso}T12:00:00Z`));
const STATUS: Record<FactuurStatus, { label: string; kleur: string }> = {
  open: { label: "Open", kleur: "bg-amber-100 text-amber-900" },
  betaald: { label: "Betaald", kleur: "bg-green-100 text-green-800" },
  geannuleerd: { label: "Geannuleerd", kleur: "bg-stone-200 text-stone-700" },
};

async function Inhoud({ zoek }: { zoek: Promise<{ filter?: string }> }) {
  const { filter: gekozen } = await zoek;
  const rol = await haalRol();
  if (rol !== "directie" && rol !== "kantoor" && rol !== "verkoop") redirect("/");
  const filter: Filter = isFilter(gekozen) ? gekozen : "open";
  const vandaag = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Amsterdam" }).format(new Date());

  const supabase = await maakServerClient();
  const { data } = await supabase.from("facturen")
    .select("id, nummer, termijn, totaal_incl, vervaldatum, factuurdatum, status, verzonden_op, debiteur, projecten(id, naam)")
    .order("vervaldatum").limit(1000);
  const rijen = (data ?? []) as unknown as Rij[];
  const { data: bData } = rijen.length ? await supabase.from("factuur_betalingen").select("factuur_id, bedrag").in("factuur_id", rijen.map((r) => r.id)) : { data: [] };
  const betaald = new Map<string, number>();
  for (const b of (bData ?? []) as { factuur_id: string; bedrag: number | string }[]) betaald.set(b.factuur_id, Math.round(((betaald.get(b.factuur_id) ?? 0) + Number(b.bedrag)) * 100) / 100);

  const alle: OverzichtFactuur[] = rijen.map((r) => ({
    id: r.id, nummer: r.nummer, projectId: r.projecten?.id ?? "", projectNaam: r.projecten?.naam ?? "", klantNaam: r.debiteur?.naam ?? "", termijn: r.termijn,
    totaal: Number(r.totaal_incl), vervaldatum: r.vervaldatum, factuurdatum: r.factuurdatum, status: r.status, verzonden: r.verzonden_op !== null, betaald: betaald.get(r.id) ?? 0,
  }));
  const s = samenvatting(alle, vandaag);
  const lijst = sorteerOpVervaldatum(filterFacturen(alle, filter, vandaag));

  return (
    <>
      <h1 className="text-2xl font-semibold">Facturen</h1>
      <p className="mt-1 text-sm text-stone-600">Alle termijnfacturen. Een factuur maak je aan op de projectpagina.</p>

      <div className="mt-5 grid gap-3 sm:grid-cols-4">
        <div className="rounded-lg border border-stone-200 bg-white p-4"><div className="text-xs uppercase tracking-wide text-stone-500">Openstaand</div><div className="mt-1 text-xl font-bold tabular-nums">{euroTekst(s.openstaand, 0)}</div><div className="text-xs text-stone-500">{s.aantalOpen} facturen</div></div>
        <div className={`rounded-lg border p-4 ${s.aantalTeLaat ? "border-red-200 bg-red-50" : "border-stone-200 bg-white"}`}><div className="text-xs uppercase tracking-wide text-stone-500">Te laat</div><div className={`mt-1 text-xl font-bold tabular-nums ${s.aantalTeLaat ? "text-red-800" : ""}`}>{euroTekst(s.teLaat, 0)}</div><div className="text-xs text-stone-500">{s.aantalTeLaat} facturen</div></div>
        <div className="rounded-lg border border-stone-200 bg-white p-4"><div className="text-xs uppercase tracking-wide text-stone-500">Gefactureerd</div><div className="mt-1 text-xl font-bold tabular-nums">{euroTekst(s.gefactureerd, 0)}</div><div className="text-xs text-stone-500">incl. btw, zonder geannuleerde</div></div>
        <div className="rounded-lg border border-stone-200 bg-white p-4"><div className="text-xs uppercase tracking-wide text-stone-500">Ontvangen</div><div className="mt-1 text-xl font-bold tabular-nums text-green-800">{euroTekst(s.ontvangen, 0)}</div><div className="text-xs text-stone-500">betalingen tot nu toe</div></div>
      </div>

      <nav aria-label="Filter" className="mt-5 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Link key={f.sleutel} href={`/facturen?filter=${f.sleutel}`} aria-current={f.sleutel === filter ? "page" : undefined}
            className={`rounded-full border px-4 py-1.5 text-sm font-semibold ${f.sleutel === filter ? "border-[#24332B] bg-[#24332B] text-white" : "border-stone-300 bg-white hover:bg-stone-50"}`}>{f.label}</Link>
        ))}
      </nav>

      <div className="mt-4 overflow-x-auto rounded-lg border border-stone-200 bg-white">
        <table className="w-full min-w-max text-left text-sm">
          <thead className="border-b border-stone-200 bg-stone-50 text-xs uppercase tracking-wide text-stone-500">
            <tr><th className="px-3 py-2 font-semibold">Factuur</th><th className="px-3 py-2 font-semibold">Klant en project</th><th className="px-3 py-2 font-semibold">Termijn</th><th className="px-3 py-2 font-semibold">Vervalt</th><th className="px-3 py-2 text-right font-semibold">Bedrag</th><th className="px-3 py-2 text-right font-semibold">Openstaand</th><th className="px-3 py-2 font-semibold">Status</th></tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {lijst.length === 0 && <tr><td colSpan={7} className="px-3 py-6 text-center text-stone-500">Geen facturen in deze weergave.</td></tr>}
            {lijst.map((f) => {
              const laat = isTeLaat(f.status, f.vervaldatum, vandaag);
              return (
                <tr key={f.id}>
                  <td className="px-3 py-2"><Link href={`/facturen/${f.id}`} className="font-mono underline">{f.nummer}</Link></td>
                  <td className="px-3 py-2"><div className="font-semibold">{f.klantNaam}</div><Link href={`/projecten/${f.projectId}#facturen`} className="text-stone-600 underline">{f.projectNaam}</Link></td>
                  <td className="px-3 py-2">{f.termijn}</td>
                  <td className={`px-3 py-2 ${laat ? "font-semibold text-red-700" : ""}`}>{datum(f.vervaldatum)}{laat ? <div className="text-xs">{teLaatTekst(f, vandaag)}</div> : null}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{euroTekst(f.totaal)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{f.status === "open" ? euroTekst(openBedrag(f)) : "-"}</td>
                  <td className="px-3 py-2"><span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS[f.status].kleur}`}>{STATUS[f.status].label}</span>{f.status === "open" && !f.verzonden ? <div className="mt-1 text-xs text-amber-800">niet verzonden</div> : null}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

export default function FacturenPagina(props: { searchParams: Promise<{ filter?: string }> }) {
  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <Suspense fallback={<p className="text-stone-500">Facturen laden…</p>}><Inhoud zoek={props.searchParams} /></Suspense>
    </main>
  );
}
