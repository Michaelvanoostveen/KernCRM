import { redirect } from "next/navigation";
import { Suspense } from "react";
import { maakServerClient } from "@/lib/supabase/server";
import { BEZORG_LABEL, besteGebeurtenis, IS_PROBLEEM, probleemUitleg, type BezorgEvent } from "@/lib/mail/bezorging";
import { haalRol } from "../../start-gegevens";
import { bewaarMailInstellingen, stuurTestmail } from "./actions";

type Instellingen = { provider: string; actief: boolean; afzender_naam: string | null; afzender_adres: string | null; antwoord_adres: string | null };
type Logregel = { id: string; soort: string; aan: string; onderwerp: string; status: "verzonden" | "mislukt"; extern_id: string | null; fout: string | null; aangemaakt: string; facturen: { nummer: string } | null; creditnotas: { nummer: string } | null; offertes: { versie: number; projecten: { nummer: string } | null } | null; mail_events: BezorgEvent[] };

const MELDINGEN: Record<string, { tekst: string; fout: boolean }> = {
  bewaard: { tekst: "De instellingen zijn bewaard.", fout: false },
  test_verzonden: { tekst: "De testmail is verstuurd naar je eigen adres. Controleer of hij in je inbox staat en niet in de spam.", fout: false },
  test_mislukt: { tekst: "De testmail is niet verstuurd. De reden staat in het logboek hieronder.", fout: true },
  niet_ingesteld: { tekst: "Vul eerst de afzender in en sla de instellingen op.", fout: true },
  geen_sleutel: { tekst: "De koppeling met de mailserver is nog niet verbonden: de sleutel ontbreekt op de server.", fout: true },
  geen_eigen_adres: { tekst: "Je inlogadres is geen geldig e-mailadres, dus er kan geen testmail naartoe.", fout: true },
  limiet: { tekst: "Er zijn het afgelopen uur al veel mails verstuurd. Probeer het later opnieuw.", fout: true },
  domein_niet_vrijgegeven: { tekst: "Dit domein is niet vrijgegeven voor jouw bedrijf. Het domein moet eerst bij de platformbeheerder worden aangemeld en geverifieerd.", fout: true },
  onvolledig: { tekst: "Vul afzendernaam en afzenderadres in en kies een mailserver voordat je mailen aanzet.", fout: true },
  ongeldig: { tekst: "Controleer de ingevulde gegevens: één geldig adres per veld, en een naam zonder haakjes, komma's of aanhalingstekens.", fout: true },
  rechten: { tekst: "Alleen de directie wijzigt de instellingen.", fout: true },
  geen_toegang: { tekst: "Daar heb je geen toestemming voor.", fout: true },
  mislukt: { tekst: "Het lukte niet. Probeer het opnieuw.", fout: true },
};
const SOORT: Record<string, string> = { test: "Testmail", factuur: "Factuur", herinnering: "Herinnering", betaalbevestiging: "Betaalbevestiging", creditnota: "Creditnota", offerte: "Offerte" };
const veld = "mt-1 w-full rounded-md border border-stone-300 px-3 py-2 text-sm";
const tijd = (iso: string) => new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Amsterdam" }).format(new Date(iso));

async function Inhoud({ zoek }: { zoek: Promise<{ m?: string }> }) {
  const { m } = await zoek;
  const rol = await haalRol();
  if (rol !== "directie" && rol !== "kantoor") redirect("/");
  const magInstellen = rol === "directie";
  const supabase = await maakServerClient();
  const [{ data: iRij }, { data: dData }, { data: lData }] = await Promise.all([
    supabase.from("mail_instellingen").select("provider, actief, afzender_naam, afzender_adres, antwoord_adres").maybeSingle(),
    supabase.from("mail_domeinen").select("domein").order("domein"),
    supabase.from("mail_log").select("id, soort, aan, onderwerp, status, extern_id, fout, aangemaakt, facturen(nummer), creditnotas(nummer), offertes(versie, projecten(nummer)), mail_events(soort, detail, opgetreden)").order("aangemaakt", { ascending: false }).limit(50),
  ]);
  const i: Instellingen = (iRij as Instellingen | null) ?? { provider: "geen", actief: false, afzender_naam: null, afzender_adres: null, antwoord_adres: null };
  const domeinen = ((dData ?? []) as { domein: string }[]).map((d) => d.domein);
  const log = (lData ?? []) as unknown as Logregel[];
  const sleutelAanwezig = !!process.env.RESEND_API_KEY;
  const melding = m ? MELDINGEN[m] : null;

  return (
    <>
      <h1 className="text-2xl font-semibold">E-mail</h1>
      <p className="mt-1 text-sm text-stone-600">Facturen, herinneringen, betaalbevestigingen en creditnota&apos;s kunnen vanuit het CRM worden verstuurd, met de PDF als bijlage. De mail gaat via een bezorgdienst (Resend) namens jouw bedrijf; antwoorden komen in je eigen mailbox.</p>
      {melding && <p role={melding.fout ? "alert" : "status"} className={`mt-4 rounded-md px-4 py-2.5 text-sm ${melding.fout ? "bg-red-50 text-red-800" : "bg-green-50 text-green-800"}`}>{melding.tekst}</p>}

      <section className="mt-6 rounded-lg border border-stone-200 bg-white p-5" aria-label="Verbinding">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-500">Verbinding</h2>
        <ul className="mt-2 grid gap-1 text-sm">
          <li><span aria-hidden className={sleutelAanwezig ? "text-green-700" : "text-red-700"}>{sleutelAanwezig ? "✓" : "✗"}</span> Mailsleutel op de server: {sleutelAanwezig ? "aanwezig" : "ontbreekt (RESEND_API_KEY in Vercel)"}</li>
          <li><span aria-hidden className={domeinen.length > 0 ? "text-green-700" : "text-red-700"}>{domeinen.length > 0 ? "✓" : "✗"}</span> Vrijgegeven domein{domeinen.length === 1 ? "" : "en"}: {domeinen.length > 0 ? domeinen.join(", ") : "nog geen. De platformbeheerder moet het domein na de verificatie aanmelden."}</li>
          <li><span aria-hidden className={i.actief ? "text-green-700" : "text-stone-400"}>{i.actief ? "✓" : "•"}</span> Mailen vanuit het CRM: {i.actief ? "aan" : "uit"}</li>
        </ul>
      </section>

      <section className="mt-4 rounded-lg border border-stone-200 bg-white p-5" aria-label="Instellingen">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-500">Instellingen</h2>
        <form action={bewaarMailInstellingen} className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-semibold">Mailserver
            <select name="provider" defaultValue={i.provider} disabled={!magInstellen} className={veld}>
              <option value="geen">Geen</option>
              <option value="resend">Resend</option>
            </select>
          </label>
          <label className="flex items-center gap-2 self-end pb-2 text-sm font-semibold"><input type="checkbox" name="actief" value="aan" defaultChecked={i.actief} disabled={!magInstellen} /> Mailen vanuit het CRM aan</label>
          <label className="text-xs font-semibold">Afzendernaam
            <input name="afzender_naam" maxLength={80} defaultValue={i.afzender_naam ?? ""} readOnly={!magInstellen} placeholder="KernKozijnen B.V." className={veld} />
          </label>
          <label className="text-xs font-semibold">Afzenderadres
            <input name="afzender_adres" maxLength={120} defaultValue={i.afzender_adres ?? ""} readOnly={!magInstellen} placeholder="info@mail.kernkozijnen.nl" className={veld} />
            <span className="mt-1 block font-normal text-stone-500">Moet op een vrijgegeven domein staan.</span>
          </label>
          <label className="text-xs font-semibold sm:col-span-2">Antwoorden naar
            <input name="antwoord_adres" maxLength={120} defaultValue={i.antwoord_adres ?? ""} readOnly={!magInstellen} placeholder="info@kernkozijnen.nl" className={veld} />
            <span className="mt-1 block font-normal text-stone-500">Hier komen de antwoorden van klanten binnen: je gewone mailbox.</span>
          </label>
          {magInstellen
            ? <div className="sm:col-span-2"><button className="rounded-md bg-[#24332B] px-4 py-2 text-sm font-semibold text-white">Opslaan</button></div>
            : <p className="text-sm text-stone-500 sm:col-span-2">Alleen de directie wijzigt deze instellingen.</p>}
        </form>
        <form action={stuurTestmail} className="mt-3 border-t border-stone-100 pt-3">
          <button className="rounded-md border border-stone-300 bg-white px-4 py-2 text-sm font-semibold hover:bg-stone-50">Testmail naar mijn eigen adres</button>
          <p className="mt-1 text-xs text-stone-500">Controleer na het versturen of de mail in je inbox staat en niet in de spam.</p>
        </form>
      </section>

      <section className="mt-4 rounded-lg border border-stone-200 bg-white p-5" aria-label="Logboek">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-500">Logboek (laatste 50)</h2>
        {log.length === 0 ? <p className="mt-2 text-sm text-stone-600">Er is nog niets verstuurd.</p> : (
          <>
          <p className="mt-1 text-xs text-stone-500">De bezorgstatus (bezorgd, teruggekaatst) komt van Resend. Staat een mail op &quot;Onderweg&quot;, dan is er nog geen bericht binnen.</p>
          <ul className="mt-2 divide-y divide-stone-100 text-sm">
            {log.map((l) => (
              <li key={l.id} className="py-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span><b>{SOORT[l.soort] ?? l.soort}</b> {l.facturen?.nummer ?? l.creditnotas?.nummer ?? (l.offertes ? `${l.offertes.projecten?.nummer ?? ""} v${l.offertes.versie}` : "")} <span className="text-stone-600">aan {l.aan}</span></span>
                  <span className="flex items-center gap-2 text-xs text-stone-500">{tijd(l.aangemaakt)} {(() => {
                    const b = l.status === "verzonden" ? besteGebeurtenis(l.mail_events ?? []) : null;
                    const sleutel = l.status === "mislukt" ? "mislukt" : b?.soort ?? "onderweg";
                    return <span className={`rounded-full px-2 py-0.5 font-semibold ${BEZORG_LABEL[sleutel].kleur}`}>{BEZORG_LABEL[sleutel].label}</span>;
                  })()}</span>
                </div>
                {l.fout && <p className="mt-1 text-xs text-red-800">{l.fout}</p>}
                {(() => {
                  const b = l.status === "verzonden" ? besteGebeurtenis(l.mail_events ?? []) : null;
                  return b && IS_PROBLEEM(b.soort) ? <p className="mt-1 text-xs text-red-800">{probleemUitleg(b.soort)}{b.detail ? ` (${b.detail})` : ""}</p> : null;
                })()}
              </li>
            ))}
          </ul>
          </>
        )}
      </section>
    </>
  );
}

export default function EmailPagina(props: { searchParams: Promise<{ m?: string }> }) {
  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <Suspense fallback={<p className="text-stone-500">Laden…</p>}><Inhoud zoek={props.searchParams} /></Suspense>
    </main>
  );
}
