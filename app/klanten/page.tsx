import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { maakServerClient } from "@/lib/supabase/server";
import { KOLOMMEN, type KlantRij } from "@/lib/klanten/kolommen";
import { bewaarKolommen, leesKolommen } from "./actions";

async function uitloggen() {
  "use server";
  const supabase = await maakServerClient();
  await supabase.auth.signOut();
  redirect("/login");
}

const SELECTIE =
  "id, naam, type, aanhef, voornaam, tussenvoegsel, achternaam, bedrijfsnaam, email, telefoon, mobiel, website, herkomst, aangemaakt, adressen(soort, straat, huisnummer, toevoeging, postcode, plaats, land, woningtype, bouwjaar, bereikbaarheid, monument)";

async function Overzicht() {
  const supabase = await maakServerClient();
  const [{ data, error }, gekozen] = await Promise.all([
    supabase.from("klanten").select(SELECTIE).order("naam"),
    leesKolommen(),
  ]);
  const klanten = (data ?? []) as unknown as KlantRij[];
  const zichtbaar = KOLOMMEN.filter((k) => gekozen.includes(k.id));

  return (
    <>
      <div className="mt-6 flex items-center justify-between gap-3">
        <p className="text-sm text-stone-600">{error ? "" : `${klanten.length} ${klanten.length === 1 ? "klant" : "klanten"}`}</p>
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
          Nog geen klanten. Voeg de eerste toe met &ldquo;Nieuwe klant&rdquo;.
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

export default function Klanten() {
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
        <Overzicht />
      </Suspense>
    </main>
  );
}
