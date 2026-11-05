import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { maakServerClient } from "@/lib/supabase/server";
import { KOLOMMEN, type KlantRij } from "@/lib/klanten/kolommen";
import { KLANTTYPES } from "@/lib/klanten/klant";
import { bewaarKolommen, leesKolommen } from "./actions";

async function uitloggen() {
  "use server";
  const supabase = await maakServerClient();
  await supabase.auth.signOut();
  redirect("/login");
}

const SELECTIE =
  "id, naam, type, aanhef, voornaam, tussenvoegsel, achternaam, bedrijfsnaam, email, telefoon, mobiel, website, herkomst, aangemaakt, adressen(soort, straat, huisnummer, toevoeging, postcode, plaats, land, woningtype, bouwjaar, bereikbaarheid, monument)";

const MAX_RIJEN = 200;

async function zoekKlanten(supabase: Awaited<ReturnType<typeof maakServerClient>>, zoek: string, soort: string) {
  let query = supabase.from("klanten").select(SELECTIE).order("naam").limit(MAX_RIJEN);
  if (KLANTTYPES.some((t) => t.waarde === soort)) query = query.eq("type", soort);
  // Tekens die in een filter iets bijzonders betekenen, vervangen we door een spatie.
  const q = zoek.replace(/[%*,()"\\]/g, " ").trim();
  if (q) {
    const patroon = `%${q}%`;
    const { data: treffers } = await supabase
      .from("adressen")
      .select("klant_id")
      .or(`plaats.ilike.${patroon},straat.ilike.${patroon},postcode.ilike.${patroon}`)
      .limit(500);
    const ids = [...new Set((treffers ?? []).map((a) => a.klant_id as string))];
    const filters = ["naam", "bedrijfsnaam", "achternaam", "email", "telefoon", "mobiel"].map((veld) => `${veld}.ilike.${patroon}`);
    if (ids.length) filters.push(`id.in.(${ids.join(",")})`);
    query = query.or(filters.join(","));
  }
  return query;
}

async function Overzicht({ zoek, soort }: { zoek: string; soort: string }) {
  const supabase = await maakServerClient();
  const [{ data, error }, gekozen] = await Promise.all([zoekKlanten(supabase, zoek, soort), leesKolommen()]);
  const klanten = (data ?? []) as unknown as KlantRij[];
  const zichtbaar = KOLOMMEN.filter((k) => gekozen.includes(k.id));

  return (
    <>
      <form action="/klanten" className="mt-6 flex flex-wrap items-center gap-2">
        <input name="q" type="search" defaultValue={zoek} placeholder="Zoek op naam, e-mail, telefoon, plaats of postcode" aria-label="Zoeken" className="min-w-0 flex-1 basis-64 rounded-md border border-stone-300 bg-white px-3 py-2 text-sm" />
        <select name="soort" defaultValue={soort} aria-label="Soort klant" className="rounded-md border border-stone-300 bg-white px-3 py-2 text-sm">
          <option value="">Alle soorten</option>
          {KLANTTYPES.map((t) => <option key={t.waarde} value={t.waarde}>{t.label}</option>)}
        </select>
        <button className="rounded-md bg-[#B35B40] px-4 py-2 text-sm font-semibold text-white">Zoeken</button>
        {(zoek || soort) && <Link href="/klanten" className="text-sm text-stone-600 underline">Wissen</Link>}
      </form>
      <div className="mt-4 flex items-center justify-between gap-3">
        <p className="text-sm text-stone-600">
          {error ? "" : `${klanten.length}${klanten.length === MAX_RIJEN ? "+" : ""} ${klanten.length === 1 ? "klant" : "klanten"}`}
          {klanten.length === MAX_RIJEN && " (de eerste 200; scherp je zoekopdracht aan)"}
        </p>
        <details className="relative">
          <summary className="cursor-pointer list-none rounded-md border border-stone-300 bg-white px-3 py-1.5 text-sm font-semibold">Kolommen</summary>
          <form action={bewaarKolommen} className="absolute right-0 z-10 mt-2 w-64 rounded-lg border border-stone-200 bg-white p-4 shadow-lg">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-500">Toon in het overzicht</p>
            <ul className="flex max-h-72 flex-col gap-1.5 overflow-y-auto">
              <li className="flex items-center gap-2 text-sm text-stone-500"><input type="checkbox" checked disabled className="h-4 w-4" /> Naam (altijd zichtbaar)</li>
              {KOLOMMEN.map((k) => (
                <li key={k.id}>
                  <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="kolom" value={k.id} defaultChecked={gekozen.includes(k.id)} className="h-4 w-4" /> {k.label}</label>
                </li>
              ))}
            </ul>
            <div className="mt-3 flex gap-2">
              <button className="rounded-md bg-[#B35B40] px-3 py-1.5 text-sm font-semibold text-white">Opslaan</button>
              <button name="actie" value="standaard" className="rounded-md border border-stone-300 px-3 py-1.5 text-sm font-semibold">Standaard</button>
            </div>
          </form>
        </details>
      </div>

      {error && <p role="alert" className="mt-4 text-red-700">De klanten konden niet worden geladen.</p>}
      {!error && klanten.length === 0 && (
        <p className="mt-4 rounded-lg border border-dashed border-stone-300 p-8 text-center text-stone-600">
          {zoek || soort ? "Geen klanten gevonden. Probeer een andere zoekterm." : "Nog geen klanten. Voeg de eerste toe met \u201cNieuwe klant\u201d."}
        </p>
      )}
      {klanten.length > 0 && (
        <div className="mt-3 overflow-x-auto rounded-lg border border-stone-200 bg-white">
          <table className="w-full min-w-max text-left text-sm">
            <thead className="border-b border-stone-200 text-xs uppercase tracking-wide text-stone-500">
              <tr>
                <th className="px-4 py-3 font-semibold">Naam</th>
                {zichtbaar.map((k) => <th key={k.id} className="px-4 py-3 font-semibold">{k.label}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {klanten.map((klant) => (
                <tr key={klant.id} className="hover:bg-stone-50">
                  <td className="px-4 py-3 font-semibold"><Link href={`/klanten/${klant.id}`} className="underline-offset-2 hover:underline">{klant.naam}</Link></td>
                  {zichtbaar.map((k) => <td key={k.id} className="px-4 py-3 text-stone-700">{k.waarde(klant) || <span className="text-stone-300">—</span>}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

async function Zoekresultaat({ searchParams }: { searchParams: Promise<{ q?: string; soort?: string }> }) {
  const { q = "", soort = "" } = await searchParams;
  return <Overzicht zoek={q.slice(0, 80)} soort={soort} />;
}

export default function Klanten({ searchParams }: { searchParams: Promise<{ q?: string; soort?: string }> }) {
  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Klanten</h1>
        <div className="flex gap-2">
          <Link href="/klanten/nieuw" className="rounded-md bg-[#B35B40] px-4 py-2 font-semibold text-white hover:brightness-110">+ Nieuwe klant</Link>
          <form action={uitloggen}><button className="rounded-md border border-stone-300 bg-white px-4 py-2 font-semibold">Uitloggen</button></form>
        </div>
      </div>
      <Suspense fallback={<p className="mt-8 text-stone-500">Klanten laden…</p>}>
        <Zoekresultaat searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
