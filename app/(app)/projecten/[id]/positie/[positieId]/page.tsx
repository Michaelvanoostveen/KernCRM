import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { maakServerClient } from "@/lib/supabase/server";
import { haalPrijsregels } from "@/lib/prijs";
import type { Configuratie } from "@/lib/prijs";
import { leesConfiguratie } from "@/lib/projecten/positie";
import { bewaarPositie } from "../../../actions";
import Configurator from "./configurator";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function beginConfiguratie(): Configuratie {
  const regels = haalPrijsregels();
  const p = regels.producten.raam;
  return {
    product: "raam", variant: p.variants[0].key, w: p.wDef, h: p.hDef,
    glas: Object.keys(regels.glas)[0], kleur: Object.keys(regels.kleuren)[0], kleurVleugel: null,
    beslag: Object.keys(regels.beslag)[0], binnen: Object.keys(regels.binnen)[0], profiel: Object.keys(regels.profielen)[0], cols: null,
  };
}

async function Inhoud({ params }: { params: Promise<{ id: string; positieId: string }> }) {
  const { id, positieId } = await params;
  if (!UUID.test(id) || (positieId !== "nieuw" && !UUID.test(positieId))) notFound();

  const supabase = await maakServerClient();
  const { data: project } = await supabase.from("projecten").select("id, nummer, naam").eq("id", id).maybeSingle();
  if (!project) notFound();

  let begin = beginConfiguratie();
  let ruimte = "";
  let aantal = 1;
  let nummer: number | null = null;
  if (positieId !== "nieuw") {
    const { data: positie } = await supabase.from("posities").select("nummer, ruimte, aantal, config").eq("id", positieId).eq("project_id", id).maybeSingle();
    if (!positie) notFound();
    try {
      begin = leesConfiguratie(positie.config);
    } catch {
      // Onleesbare opgeslagen configuratie: begin met de standaard en laat de gebruiker opnieuw kiezen.
    }
    ruimte = positie.ruimte ?? "";
    aantal = positie.aantal;
    nummer = positie.nummer;
  }

  return (
    <>
      <Link href={`/projecten/${id}`} className="text-sm text-stone-600 underline">&larr; Terug naar {project.naam}</Link>
      <div className="mt-3 mb-5">
        <div className="font-mono text-xs text-stone-500">{project.nummer}</div>
        <h1 className="text-2xl font-semibold">{nummer ? `Positie ${nummer} bewerken` : "Nieuwe positie"}</h1>
      </div>
      <Configurator regels={haalPrijsregels()} begin={begin} beginRuimte={ruimte} beginAantal={aantal} projectId={id} positieId={positieId} actie={bewaarPositie} annuleerHref={`/projecten/${id}`} />
    </>
  );
}

export default function PositiePagina(props: { params: Promise<{ id: string; positieId: string }> }) {
  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <Suspense fallback={<p className="text-stone-500">Laden…</p>}>
        <Inhoud {...props} />
      </Suspense>
    </main>
  );
}
