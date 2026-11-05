import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { maakServerClient } from "@/lib/supabase/server";
import { haalPrijsregels } from "@/lib/prijs";
import { kozijnSvg } from "@/lib/tekening/tekenen";
import { FASEN, faseIndex, faseLabel } from "@/lib/projecten/fase";
import { leesConfiguratie, positieOmschrijving } from "@/lib/projecten/positie";
import { INSTELLINGEN_KERNKOZIJNEN } from "@/lib/offerte/instellingen";
import OfferteEditor, { type EditorRegel } from "./offerte-editor";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATUS: Record<string, string> = { concept: "Concept", verstuurd: "Verstuurd", akkoord: "Akkoord", afgewezen: "Afgewezen", vervallen: "Vervallen" };

type PositieRij = { id: string; nummer: number; ruimte: string | null; aantal: number; prijs: number; config: unknown };
type RegelRij = {
  id: string; volgorde: number; soort: EditorRegel["soort"]; positie_id: string | null; titel: string | null; tekst: string | null;
  aantal: number; prijs: number; korting_modus: "percentage" | "bedrag" | null; korting_waarde: number | null; posities: PositieRij | null;
};

function maakRegel(r: RegelRij): EditorRegel {
  const basis: EditorRegel = { id: r.id, soort: r.soort, positieId: r.positie_id, titel: r.titel, tekst: r.tekst, aantal: Number(r.aantal), prijs: Number(r.prijs), modus: r.korting_modus, waarde: r.korting_waarde === null ? null : Number(r.korting_waarde) };
  if (r.soort !== "positie" || !r.posities) return basis;
  const p = r.posities;
  const regels = haalPrijsregels();
  let svg: string | null = null;
  let omschrijving = "Onleesbare configuratie";
  try {
    const cfg = leesConfiguratie(p.config);
    svg = kozijnSvg(regels, { ...cfg }, `Positie ${p.nummer}`);
    omschrijving = positieOmschrijving(regels, cfg);
  } catch {
    // De positie blijft zichtbaar zonder tekening.
  }
  return { ...basis, aantal: p.aantal, prijs: Number(p.prijs), nummer: p.nummer, ruimte: p.ruimte, omschrijving, svg };
}

async function Inhoud({ params, zoek }: { params: Promise<{ id: string }>; zoek: Promise<{ opgeslagen?: string }> }) {
  const { id } = await params;
  const { opgeslagen } = await zoek;
  if (!UUID.test(id)) notFound();
  const supabase = await maakServerClient();
  const { data: p } = await supabase
    .from("projecten")
    .select("id, tenant_id, nummer, naam, fase, klanten(id, naam), offertes(id, versie, status, gewijzigd)")
    .eq("id", id)
    .maybeSingle();
  if (!p) notFound();

  const klant = p.klanten as unknown as { id: string; naam: string } | null;
  const offerte = [...(p.offertes as { id: string; versie: number; status: string; gewijzigd: string }[])].sort((a, b) => b.versie - a.versie)[0];
  const { data: regelData } = offerte
    ? await supabase
        .from("offerte_regels")
        .select("id, volgorde, soort, positie_id, titel, tekst, aantal, prijs, korting_modus, korting_waarde, posities(id, nummer, ruimte, aantal, prijs, config)")
        .eq("offerte_id", offerte.id)
        .order("volgorde")
    : { data: [] };
  const regels = ((regelData ?? []) as unknown as RegelRij[]).map(maakRegel);

  const { data: { user } } = await supabase.auth.getUser();
  const { data: lid } = user ? await supabase.from("tenant_leden").select("rol").eq("tenant_id", p.tenant_id).eq("user_id", user.id).maybeSingle() : { data: null };
  const nu = faseIndex(p.fase);

  return (
    <>
      <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="font-mono text-xs text-stone-500">{p.nummer}</div>
          <h1 className="text-2xl font-semibold">{p.naam}</h1>
          <p className="mt-1 text-sm text-stone-600">{klant ? <>Klant: <Link href={`/klanten/${klant.id}`} className="underline underline-offset-2">{klant.naam}</Link></> : null}</p>
        </div>
      </div>

      <ol className="mt-5 flex overflow-x-auto rounded-lg border border-stone-200 bg-white p-3 text-xs" aria-label={`Fase van het project: ${faseLabel(p.fase)}`}>
        {FASEN.map((f, i) => (
          <li key={f.waarde} className={`flex-1 whitespace-nowrap px-2 text-center ${i < nu ? "text-green-700" : i === nu ? "font-bold text-[#9C4B32]" : "text-stone-400"}`}>
            <span className={`mx-auto mb-1 block h-2.5 w-2.5 rounded-full ${i < nu ? "bg-green-600" : i === nu ? "bg-[#B35B40] ring-4 ring-[#F4E3DC]" : "bg-stone-200"}`} />
            {f.label}
          </li>
        ))}
      </ol>

      {offerte ? (
        <OfferteEditor
          key={`${offerte.id}-${offerte.gewijzigd}-${regels.length}`}
          projectId={p.id}
          begin={regels}
          rol={lid?.rol ?? null}
          inst={INSTELLINGEN_KERNKOZIJNEN}
          vergrendeld={offerte.status !== "concept"}
          versie={offerte.versie}
          statusLabel={STATUS[offerte.status] ?? offerte.status}
          opgeslagen={opgeslagen === "1"}
        />
      ) : (
        <p className="mt-6 rounded-lg border border-dashed border-stone-300 bg-white p-8 text-center text-stone-600">Dit project heeft nog geen offerte.</p>
      )}
    </>
  );
}

export default function ProjectPagina(props: { params: Promise<{ id: string }>; searchParams: Promise<{ opgeslagen?: string }> }) {
  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <Link href="/projecten" className="text-sm text-stone-600 underline">&larr; Alle projecten</Link>
      <Suspense fallback={<p className="mt-6 text-stone-500">Project laden…</p>}>
        <Inhoud params={props.params} zoek={props.searchParams} />
      </Suspense>
    </main>
  );
}
