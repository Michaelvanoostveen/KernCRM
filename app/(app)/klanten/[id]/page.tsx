import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { maakServerClient } from "@/lib/supabase/server";
import { adresTekst, isBedrijf, persoonsnaam, typeLabel } from "@/lib/klanten/klant";
import type { KlantAdres, KlantRij } from "@/lib/klanten/kolommen";
import { verwijderKlant } from "../formulier-actions";
import { maakProject } from "../../projecten/actions";
import { faseLabel } from "@/lib/projecten/fase";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const AANHEF: Record<string, string> = { dhr: "Dhr.", mevr: "Mevr.", geen: "" };

type Detail = KlantRij & { factuur_email: string | null; kvk: string | null; btw_nummer: string | null; notitie: string | null; marketing_toestemming: boolean };

function Regel({ titel, waarde, href }: { titel: string; waarde?: string | null; href?: string }) {
  if (!waarde) return null;
  return (
    <div className="grid grid-cols-3 gap-3 py-1.5 text-sm">
      <dt className="text-stone-500">{titel}</dt>
      <dd className="col-span-2 break-words">{href ? <a href={href} className="underline underline-offset-2">{waarde}</a> : waarde}</dd>
    </div>
  );
}

function Kaart({ titel, children }: { titel: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-stone-200 bg-white p-5">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-stone-500">{titel}</h2>
      {children}
    </section>
  );
}

async function Inhoud({ params, zoek }: { params: Promise<{ id: string }>; zoek: Promise<{ fout?: string }> }) {
  const { id } = await params;
  const { fout } = await zoek;
  if (!UUID.test(id)) notFound();

  const supabase = await maakServerClient();
  const { data } = await supabase
    .from("klanten")
    .select("*, adressen(soort, straat, huisnummer, toevoeging, postcode, plaats, land, woningtype, bouwjaar, bereikbaarheid, monument)")
    .eq("id", id)
    .maybeSingle();
  if (!data) notFound();

  const k = data as unknown as Detail;
  const { data: projectenData } = await supabase.from("projecten").select("id, nummer, naam, fase").eq("klant_id", id).order("aangemaakt", { ascending: false });
  const projecten = (projectenData ?? []) as { id: string; nummer: string; naam: string; fase: string }[];
  const project = k.adressen.find((a: KlantAdres) => a.soort === "project");
  const factuur = k.adressen.find((a: KlantAdres) => a.soort === "factuur");
  const factuurGelijk = !factuur || !project || adresTekst(factuur) === adresTekst(project);
  const contact = [AANHEF[k.aanhef ?? ""], persoonsnaam(k)].filter(Boolean).join(" ");

  return (
    <>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold">{k.naam}</h1>
        <span className="rounded-full bg-stone-100 px-2.5 py-0.5 text-xs text-stone-600">{typeLabel(k.type)}</span>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Link href={`/klanten/${k.id}/bewerken`} className="rounded-md bg-[#B35B40] px-4 py-2 text-sm font-semibold text-white hover:brightness-110">Bewerken</Link>
        <details className="relative">
          <summary className="cursor-pointer list-none rounded-md border border-stone-300 bg-white px-4 py-2 text-sm font-semibold">Verwijderen</summary>
          <form action={verwijderKlant} className="absolute left-0 z-10 mt-2 w-72 rounded-lg border border-stone-200 bg-white p-4 shadow-lg">
            <input type="hidden" name="id" value={k.id} />
            <p className="text-sm">Weet je zeker dat je <b>{k.naam}</b> en bijbehorende adressen wilt verwijderen? Dit kan niet ongedaan worden gemaakt.</p>
            <button className="mt-3 rounded-md bg-red-700 px-3 py-1.5 text-sm font-semibold text-white">Ja, verwijderen</button>
          </form>
        </details>
      </div>
      <p className="mt-3 text-sm text-stone-500">Aangemaakt op {new Date(k.aangemaakt).toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" })}</p>

      <div className="mt-6 grid gap-5 md:grid-cols-2">
        <Kaart titel={isBedrijf(k.type) ? "Contactpersoon" : "Contactgegevens"}>
          <dl>
            <Regel titel="Naam" waarde={contact} />
            <Regel titel="E-mail" waarde={k.email} href={k.email ? `mailto:${k.email}` : undefined} />
            <Regel titel="E-mail facturen" waarde={k.factuur_email} href={k.factuur_email ? `mailto:${k.factuur_email}` : undefined} />
            <Regel titel="Telefoon" waarde={k.telefoon} href={k.telefoon ? `tel:${k.telefoon}` : undefined} />
            <Regel titel="Mobiel" waarde={k.mobiel} href={k.mobiel ? `tel:${k.mobiel}` : undefined} />
          </dl>
        </Kaart>

        {isBedrijf(k.type) && (
          <Kaart titel="Bedrijf">
            <dl>
              <Regel titel="Bedrijfsnaam" waarde={k.bedrijfsnaam} />
              <Regel titel="KvK-nummer" waarde={k.kvk} />
              <Regel titel="Btw-nummer" waarde={k.btw_nummer} />
              <Regel titel="Website" waarde={k.website} href={k.website ?? undefined} />
            </dl>
          </Kaart>
        )}

        <Kaart titel={isBedrijf(k.type) ? "Projectadres" : "Adres"}>
          {project ? (
            <dl>
              <Regel titel="Adres" waarde={adresTekst(project)} />
              <Regel titel="Type woning" waarde={project.woningtype} />
              <Regel titel="Bouwjaar" waarde={project.bouwjaar ? String(project.bouwjaar) : null} />
              <Regel titel="Bereikbaarheid" waarde={project.bereikbaarheid} />
              <Regel titel="Monument" waarde={project.monument ? "Ja" : null} />
              <Regel titel="Factuuradres" waarde={factuurGelijk ? "Zelfde als dit adres" : adresTekst(factuur!)} />
            </dl>
          ) : (
            <p className="text-sm text-stone-500">Nog geen adres ingevuld.</p>
          )}
        </Kaart>

        <Kaart titel="Overig">
          <dl>
            <Regel titel="Herkomst" waarde={k.herkomst} />
            <Regel titel="Notitie" waarde={k.notitie} />
            <Regel titel="Nieuws en aanbiedingen" waarde={k.marketing_toestemming ? "Akkoord" : "Geen toestemming"} />
          </dl>
        </Kaart>

        <section className="rounded-lg border border-stone-200 bg-white p-5 md:col-span-2">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-500">Projecten</h2>
            <form action={maakProject} className="flex flex-wrap items-center gap-2">
              <input type="hidden" name="klant_id" value={k.id} />
              <input name="naam" aria-label="Naam van het project" placeholder={project ? `${project.straat} ${project.huisnummer}, ${project.plaats}` : "Naam van het project"} className="w-64 max-w-full rounded-md border border-stone-300 bg-white px-3 py-1.5 text-sm" />
              <button className="rounded-md bg-[#B35B40] px-3 py-1.5 text-sm font-semibold text-white hover:brightness-110">Nieuw project</button>
            </form>
          </div>
          {fout === "project" && <p role="alert" className="mb-3 text-sm text-red-700">Het project kon niet worden aangemaakt. Probeer het opnieuw.</p>}
          {projecten.length === 0 ? (
            <p className="text-sm text-stone-500">Nog geen projecten voor deze klant.</p>
          ) : (
            <ul className="divide-y divide-stone-100">
              {projecten.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center gap-3 py-2 text-sm">
                  <span className="font-mono text-xs text-stone-500">{p.nummer}</span>
                  <Link href={`/projecten/${p.id}`} className="font-semibold underline-offset-2 hover:underline">{p.naam}</Link>
                  <span className="rounded-full bg-stone-100 px-2 py-0.5 text-xs text-stone-700">{faseLabel(p.fase)}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-4 text-xs text-stone-500">De tijdlijn met mails, gesprekken en afspraken komt in een volgende stap.</p>
        </section>
      </div>
    </>
  );
}

export default function KlantPagina(props: { params: Promise<{ id: string }>; searchParams: Promise<{ fout?: string }> }) {
  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <Link href="/klanten" className="text-sm text-stone-600 underline">&larr; Terug naar klanten</Link>
      <Suspense fallback={<p className="mt-6 text-stone-500">Klant laden…</p>}>
        <Inhoud params={props.params} zoek={props.searchParams} />
      </Suspense>
    </main>
  );
}
