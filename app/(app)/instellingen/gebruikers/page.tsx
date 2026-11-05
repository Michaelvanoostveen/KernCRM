import Link from "next/link";
import { Suspense } from "react";
import { maakServerClient } from "@/lib/supabase/server";
import { zetPrijsToestemming } from "../actions";

const ROL: Record<string, string> = { directie: "Directie", verkoop: "Verkoop", kantoor: "Kantoor", inmeter: "Inmeter", monteur: "Monteur" };

async function Lijst({ zoek }: { zoek: Promise<{ fout?: string; gewijzigd?: string }> }) {
  const { fout, gewijzigd } = await zoek;
  const supabase = await maakServerClient();
  const { data, error } = await supabase.rpc("leden_overzicht");
  const leden = (data ?? []) as { user_id: string; email: string; rol: string; mag_prijzen_aanpassen: boolean }[];

  if (error) return <p role="alert" className="mt-6 text-red-700">De gebruikers konden niet worden geladen.</p>;
  if (leden.length === 0) return <p className="mt-6 rounded-lg border border-dashed border-stone-300 bg-white p-8 text-center text-stone-600">Alleen de directie kan de gebruikers beheren.</p>;

  return (
    <>
      {gewijzigd && <p role="status" className="mt-4 rounded-md bg-green-50 px-4 py-2.5 text-sm text-green-800">De toestemming is bijgewerkt.</p>}
      {fout && <p role="alert" className="mt-4 rounded-md bg-red-50 px-4 py-2.5 text-sm text-red-800">Wijzigen is niet gelukt. Alleen de directie kan dit.</p>}
      <div className="mt-6 overflow-x-auto rounded-lg border border-stone-200 bg-white">
        <table className="w-full min-w-max text-left text-sm">
          <thead className="border-b border-stone-200 text-xs uppercase tracking-wide text-stone-500">
            <tr><th className="px-4 py-3 font-semibold">Gebruiker</th><th className="px-4 py-3 font-semibold">Rol</th><th className="px-4 py-3 font-semibold">Mag prijzen handmatig aanpassen</th></tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {leden.map((l) => (
              <tr key={l.user_id}>
                <td className="px-4 py-3 font-semibold">{l.email}</td>
                <td className="px-4 py-3 text-stone-700">{ROL[l.rol] ?? l.rol}</td>
                <td className="px-4 py-3">
                  {l.rol === "directie" ? (
                    <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-semibold text-green-800">Altijd</span>
                  ) : (
                    <form action={zetPrijsToestemming} className="flex items-center gap-3">
                      <input type="hidden" name="user_id" value={l.user_id} />
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${l.mag_prijzen_aanpassen ? "bg-green-100 text-green-800" : "bg-stone-100 text-stone-600"}`}>{l.mag_prijzen_aanpassen ? "Ja" : "Nee"}</span>
                      <button name="waarde" value={l.mag_prijzen_aanpassen ? "uit" : "aan"} className="rounded-md border border-stone-300 bg-white px-3 py-1 text-xs font-semibold hover:bg-stone-50">{l.mag_prijzen_aanpassen ? "Intrekken" : "Toestaan"}</button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-4 max-w-2xl text-sm text-stone-600">Met deze toestemming kan iemand de prijs van een positie of artikel overschrijven, een eigen totaalprijs invullen en artikelen met een eigen prijs toevoegen. Elke aanpassing heeft een reden en wordt vastgelegd. Een totale prijsverlaging van meer dan 10% blijft aan de directie voorbehouden.</p>
    </>
  );
}

export default function Gebruikers(props: { searchParams: Promise<{ fout?: string; gewijzigd?: string }> }) {
  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <Link href="/klanten" className="text-sm text-stone-600 underline">&larr; Terug</Link>
      <h1 className="mt-3 text-2xl font-semibold">Gebruikers</h1>
      <p className="mt-1 text-sm text-stone-600">Wie mag wat in het CRM.</p>
      <Suspense fallback={<p className="mt-6 text-stone-500">Gebruikers laden…</p>}>
        <Lijst zoek={props.searchParams} />
      </Suspense>
    </main>
  );
}
