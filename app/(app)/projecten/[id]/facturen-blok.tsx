import { maakServerClient } from "@/lib/supabase/server";
import { euroTekst } from "@/lib/offerte/bereken";
import { bedrijfsgegevensCompleet } from "@/lib/facturatie/bedrijf";
import { isTeLaat, openstaand, type FactuurStatus } from "@/lib/facturatie/bereken";
import { annuleerFactuur, maakFactuur, registreerBetaling } from "../../facturen/actions";
import { laadFactuurplan } from "../../facturen/plan";

type Factuur = { id: string; nummer: string; termijn: number; omschrijving: string; factuurdatum: string; vervaldatum: string; totaal_incl: number | string; meerwerk: number | string; status: FactuurStatus; annulering_reden: string | null };
type Betaling = { factuur_id: string; bedrag: number | string; betaald_op: string; notitie: string | null };

const MELDINGEN: Record<string, { tekst: string; fout: boolean }> = {
  gemaakt: { tekst: "De factuur is gemaakt.", fout: false },
  betaald: { tekst: "De betaling is geregistreerd. De factuur is betaald.", fout: false },
  deelbetaling: { tekst: "De betaling is geregistreerd. Er staat nog een bedrag open.", fout: false },
  geannuleerd: { tekst: "De factuur is geannuleerd. Je kunt de termijn opnieuw factureren.", fout: false },
  geen_akkoord: { tekst: "Je kunt pas factureren nadat de klant akkoord heeft gegeven op de offerte.", fout: true },
  volgorde: { tekst: "Maak eerst de factuur van de vorige termijn.", fout: true },
  bestaat_al: { tekst: "Voor deze termijn bestaat al een factuur.", fout: true },
  inmeting_open: { tekst: "Rond eerst de inmeting af. Het meer- of minderwerk komt op de eindfactuur.", fout: true },
  te_veel: { tekst: "Dit bedrag is hoger dan wat er nog openstaat.", fout: true },
  niet_open: { tekst: "Deze factuur staat niet meer open.", fout: true },
  heeft_betalingen: { tekst: "Een factuur met betalingen kan niet worden geannuleerd.", fout: true },
  reden: { tekst: "Vul een reden in om de factuur te annuleren.", fout: true },
  ongeldig: { tekst: "Controleer de ingevulde gegevens.", fout: true },
  geen_toegang: { tekst: "Je hebt geen toestemming om te factureren.", fout: true },
  mislukt: { tekst: "Het lukte niet. Probeer het opnieuw.", fout: true },
};

const datum = (iso: string) => new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Amsterdam" }).format(new Date(`${iso}T12:00:00Z`));
const STATUS: Record<FactuurStatus, { label: string; kleur: string }> = {
  open: { label: "Open", kleur: "bg-amber-100 text-amber-900" },
  betaald: { label: "Betaald", kleur: "bg-green-100 text-green-800" },
  geannuleerd: { label: "Geannuleerd", kleur: "bg-stone-200 text-stone-700" },
};

/** Termijnfacturen van een project: het plan uit de getekende offerte, de facturen en de betalingen. */
export default async function FacturenBlok({ projectId, rol, melding }: { projectId: string; rol: string | null; melding: string | null }) {
  const supabase = await maakServerClient();
  const plan = await laadFactuurplan(supabase, projectId);
  if (!plan || plan.offerteStatus !== "akkoord") return null;

  const { data: fData } = await supabase.from("facturen").select("id, nummer, termijn, omschrijving, factuurdatum, vervaldatum, totaal_incl, meerwerk, status, annulering_reden").eq("project_id", projectId).order("termijn").order("aangemaakt");
  const facturen = (fData ?? []) as Factuur[];
  const { data: bData } = facturen.length ? await supabase.from("factuur_betalingen").select("factuur_id, bedrag, betaald_op, notitie").in("factuur_id", facturen.map((f) => f.id)).order("betaald_op") : { data: [] };
  const betalingen = (bData ?? []) as Betaling[];

  const mag = rol === "directie" || rol === "kantoor";
  const vandaag = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Amsterdam" }).format(new Date());
  const lopend = (nr: number) => facturen.find((f) => f.termijn === nr && f.status !== "geannuleerd");
  const m = melding ? MELDINGEN[melding] : null;
  const totaalGefactureerd = facturen.filter((f) => f.status !== "geannuleerd").reduce((s, f) => s + Number(f.totaal_incl), 0);
  const totaalOpdracht = plan.offerteTotaal + plan.meerwerk;

  return (
    <section id="facturen" className="mt-6 rounded-lg border border-stone-200 bg-white p-5" aria-label="Facturen">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-500">Facturen</h2>
      {m && <p role={m.fout ? "alert" : "status"} className={`mt-3 rounded-md px-4 py-2.5 text-sm ${m.fout ? "bg-red-50 text-red-800" : "bg-green-50 text-green-800"}`}>{m.tekst}</p>}
      {!bedrijfsgegevensCompleet() && (
        <p role="status" className="mt-3 rounded-md bg-amber-50 px-4 py-2.5 text-sm text-amber-900">De bedrijfsgegevens (IBAN, KvK- en btw-nummer) zijn nog niet ingevuld. Op de factuur staan daarom nog herkenbare lege plekken; verstuur facturen pas als die zijn ingevuld.</p>
      )}
      <p className="mt-3 text-sm text-stone-600">Opdracht {euroTekst(totaalOpdracht)} incl. btw{plan.meerwerk !== 0 ? ` (offerte ${euroTekst(plan.offerteTotaal)} plus meerwerk ${euroTekst(plan.meerwerk)})` : ""} · gefactureerd {euroTekst(totaalGefactureerd)}.</p>

      <ul className="mt-3 grid gap-3">
        {plan.plan.map((t) => {
          const f = lopend(t.nr);
          const vorige = t.nr === 1 || lopend(t.nr - 1);
          const gedaan = betalingen.filter((b) => b.factuur_id === f?.id).map((b) => Number(b.bedrag));
          const open = f ? openstaand(Number(f.totaal_incl), gedaan) : 0;
          const teLaat = f ? isTeLaat(f.status, f.vervaldatum, vandaag) : false;
          return (
            <li key={t.nr} className="rounded-lg border border-stone-200 p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="font-semibold">Termijn {t.nr}: {t.naam} ({t.pct}%)</div>
                  <div className="text-sm text-stone-600">{euroTekst(t.bedrag)} incl. btw{t.meerwerk !== 0 ? ` (waarvan meer-/minderwerk ${euroTekst(t.meerwerk)})` : ""}</div>
                </div>
                {f && <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS[f.status].kleur}`}>{STATUS[f.status].label}</span>}
              </div>

              {!f && mag && (
                <form action={maakFactuur} className="mt-3">
                  <input type="hidden" name="project_id" value={projectId} /><input type="hidden" name="termijn" value={t.nr} />
                  <button disabled={!vorige} className="rounded-md bg-[#B35B40] px-4 py-2 text-sm font-semibold text-white hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50">Factuur maken</button>
                  {!vorige && <span className="ml-3 text-sm text-stone-500">Volgt na termijn {t.nr - 1}.</span>}
                  {t.nr === plan.plan.length && plan.inmetingOpen && <span className="ml-3 text-sm text-amber-800">Rond eerst de inmeting af, het meerwerk komt op deze factuur.</span>}
                </form>
              )}
              {!f && !mag && <p className="mt-2 text-sm text-stone-500">Nog niet gefactureerd.</p>}

              {f && (
                <div className="mt-3 text-sm">
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                    <b className="font-mono">{f.nummer}</b>
                    <span>factuurdatum {datum(f.factuurdatum)}</span>
                    <span className={teLaat ? "font-semibold text-red-700" : ""}>vervalt {datum(f.vervaldatum)}{teLaat ? " (te laat)" : ""}</span>
                    <a href={`/facturen/${f.id}/pdf`} target="_blank" rel="noreferrer" className="underline">PDF</a>
                  </div>
                  {f.status === "open" && <div className="mt-1 font-semibold">Openstaand {euroTekst(open)}</div>}
                  {betalingen.filter((b) => b.factuur_id === f.id).map((b, i) => (
                    <div key={i} className="text-stone-600">Betaald {euroTekst(Number(b.bedrag))} op {datum(b.betaald_op)}{b.notitie ? ` · ${b.notitie}` : ""}</div>
                  ))}
                  {f.status === "open" && mag && (
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      <details className="rounded-md border border-stone-200 px-3 py-2">
                        <summary className="cursor-pointer font-semibold">Betaling registreren</summary>
                        <form action={registreerBetaling} className="mt-2 grid gap-2">
                          <input type="hidden" name="project_id" value={projectId} /><input type="hidden" name="factuur_id" value={f.id} />
                          <label className="text-xs font-semibold">Bedrag (incl. btw)<input name="bedrag" inputMode="decimal" defaultValue={String(open).replace(".", ",")} className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2 text-sm" /></label>
                          <label className="text-xs font-semibold">Datum<input type="date" name="datum" defaultValue={vandaag} className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2 text-sm" /></label>
                          <label className="text-xs font-semibold">Notitie (optioneel)<input name="notitie" className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2 text-sm" /></label>
                          <button className="rounded-md bg-[#24332B] px-4 py-2 text-sm font-semibold text-white">Registreren</button>
                        </form>
                      </details>
                      {gedaan.length === 0 && (
                        <details className="rounded-md border border-stone-200 px-3 py-2">
                          <summary className="cursor-pointer font-semibold">Factuur annuleren</summary>
                          <form action={annuleerFactuur} className="mt-2 grid gap-2">
                            <input type="hidden" name="project_id" value={projectId} /><input type="hidden" name="factuur_id" value={f.id} />
                            <label className="text-xs font-semibold">Reden<input name="reden" required className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2 text-sm" /></label>
                            <p className="text-xs text-stone-500">Het factuurnummer blijft bestaan. Daarna kun je de termijn opnieuw factureren.</p>
                            <button className="rounded-md bg-red-700 px-4 py-2 text-sm font-semibold text-white">Annuleren</button>
                          </form>
                        </details>
                      )}
                    </div>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {facturen.some((f) => f.status === "geannuleerd") && (
        <div className="mt-4 text-xs text-stone-500">
          Geannuleerd: {facturen.filter((f) => f.status === "geannuleerd").map((f) => `${f.nummer} (termijn ${f.termijn}${f.annulering_reden ? `, ${f.annulering_reden}` : ""})`).join("; ")}
        </div>
      )}
    </section>
  );
}
