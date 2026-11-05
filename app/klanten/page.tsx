import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { maakServerClient } from "@/lib/supabase/server";

async function uitloggen() {
  "use server";
  const supabase = await maakServerClient();
  await supabase.auth.signOut();
  redirect("/login");
}

async function Lijst() {
  const supabase = await maakServerClient();
  const { data: klanten, error } = await supabase
    .from("klanten")
    .select("id, naam, type, email, telefoon, mobiel, adressen(plaats, soort)")
    .order("naam");

  return (
    <>
      {error && <p role="alert" className="mt-6 text-red-700">De klanten konden niet worden geladen.</p>}
      {!error && klanten?.length === 0 && (
        <p className="mt-8 rounded-lg border border-dashed border-stone-300 p-8 text-center text-stone-600">
          Nog geen klanten. Voeg de eerste toe met &ldquo;Nieuwe klant&rdquo;.
        </p>
      )}
      {!!klanten?.length && (
        <ul className="mt-6 divide-y divide-stone-200 rounded-lg border border-stone-200 bg-white">
          {klanten.map((k) => (
            <li key={k.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
              <b className="font-semibold">{k.naam}</b>
              <span className="rounded-full bg-stone-100 px-2 py-0.5 text-xs text-stone-600">{k.type}</span>
              <span className="text-sm text-stone-600">{[k.adressen?.find((a) => a.soort === "project")?.plaats ?? k.adressen?.[0]?.plaats, k.email, k.telefoon ?? k.mobiel].filter(Boolean).join(" · ")}</span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

export default function Klanten() {
  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Klanten</h1>
        <div className="flex gap-2">
          <Link href="/klanten/nieuw" className="rounded-md bg-[#B35B40] px-4 py-2 font-semibold text-white hover:brightness-110">+ Nieuwe klant</Link>
          <form action={uitloggen}><button className="rounded-md border border-stone-300 bg-white px-4 py-2 font-semibold">Uitloggen</button></form>
        </div>
      </div>
      <Suspense fallback={<p className="mt-8 text-stone-500">Klanten laden…</p>}>
        <Lijst />
      </Suspense>
    </main>
  );
}
