import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { maakServerClient } from "@/lib/supabase/server";
import { klantNaarFormulier } from "@/lib/klanten/formulier";
import Klantformulier from "../../_components/klantformulier";
import { wijzigKlant } from "../../formulier-actions";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function Inhoud({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const supabase = await maakServerClient();
  const { data } = await supabase
    .from("klanten")
    .select("*, adressen(soort, straat, huisnummer, toevoeging, postcode, plaats, land, woningtype, bouwjaar, bereikbaarheid, monument)")
    .eq("id", id)
    .maybeSingle();
  if (!data) notFound();

  return (
    <>
      <Link href={`/klanten/${id}`} className="text-sm text-stone-600 underline">&larr; Terug naar {data.naam}</Link>
      <h1 className="mt-3 text-2xl font-semibold">Klant bewerken</h1>
      <Klantformulier actie={wijzigKlant} begin={klantNaarFormulier(data)} knop="Wijzigingen opslaan" id={id} />
    </>
  );
}

export default function KlantBewerken(props: { params: Promise<{ id: string }> }) {
  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <Suspense fallback={<p className="text-stone-500">Klant laden…</p>}>
        <Inhoud {...props} />
      </Suspense>
    </main>
  );
}
