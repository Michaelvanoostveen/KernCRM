import Link from "next/link";
import { maakServerClient } from "@/lib/supabase/server";
import { euroTekst } from "@/lib/offerte/bereken";
import { bedrijfsgegevensCompleet } from "@/lib/facturatie/bedrijf";
import { begroeting, isTeLaat, openstaand, type FactuurStatus } from "@/lib/facturatie/bereken";
import { dagenTeLaat, maakFactuurMail, maakHerinneringMail } from "@/lib/facturatie/mail";
import { BEDRIJF_FACTUUR } from "@/lib/facturatie/bedrijf";
import { FACTUUR_MELDINGEN as MELDINGEN } from "@/lib/facturatie/meldingen";
import { annuleerFactuur, maakFactuur, markeerVerzonden, registreerBetaling, registreerHerinnering, wijzigFactuur } from "../../facturen/actions";
import { laadFactuurplan } from "../../facturen/plan";

type Factuur = { id: string; tenant_id: string; toelichting: string | null; verzonden_op: string | null; gecrediteerd: number | string; debiteur: { aanhef?: string | null; achternaam?: string | null; naam?: string } | null; nummer: string; termijn: number; omschrijving: string; factuurdatum: string; vervaldatum: string; totaal_incl: number | string; meerwerk: number | string; status: FactuurStatus; annulering_reden: string | null };
type Wijziging = { factuur_id: string; oud: Record<string, unknown>; nieuw: Record<string, unknown>; reden: string; door: string | null; op: string };
type Herinnering = { factuur_id: string; niveau: number; verstuurd_op: string };
type Betaling = { factuur_id: string; bedrag: number | string; betaald_op: string; notitie: string | null };


const datum = (iso: string) => new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Amsterdam" }).format(new Date(`${iso}T12:00:00Z`));
const STATUS: Record<FactuurStatus, { label: string; kleur: string }> = {
  open: { label: "Open", kleur: "bg-amber-100 text-amber-900" },
  betaald: { label: "Betaald", kleur: "bg-green-100 text-green-800" },
  geannuleerd: { label: "Geannuleerd", kleur: "bg-stone-200 text-stone-700" },
  gecrediteerd: { label: "Gecrediteerd", kleur: "bg-stone-200 text-stone-700" },
};

/** Termijnfacturen van een project: het plan uit de getekende offerte, de facturen en de betalingen. */
export default async function FacturenBlok({ projectId, rol, melding }: { projectId: string; rol: string | null; melding: string | null }) {
  const supabase = await maakServerClient();
  const plan = await laadFactuurplan(supabase, projectId);
  if (!plan || plan.offerteStatus !== "akkoord") return null;

  const { data: fData } = await supabase.from("facturen").select("id, tenant_id, toelichting, verzonden_op, gecrediteerd, debiteur, nummer, termijn, omschrijving, factuurdatum, vervaldatum, totaal_incl, meerwerk, status, annulering_reden").eq("project_id", projectId).order("termijn").order("aangemaakt");
  const facturen = (fData ?? []) as Factuur[];
  const { data: bData } = facturen.length ? await supabase.from("factuur_betalingen").select("factuur_id, bedrag, betaald_op, notitie").in("factuur_id", facturen.map((f) => f.id)).order("betaald_op") : { data: [] };
  const betalingen = (bData ?? []) as Betaling[];

  const { data: lData } = facturen.length ? await supabase.from("factuur_betaallinks").select("factuur_id, url").in("factuur_id", facturen.map((f) => f.id)).eq("status", "open").or(`geldig_tot.is.null,geldig_tot.gte.${new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Amsterdam" }).format(new Date())}`) : { data: [] };
  const betaallinks = new Map(((lData ?? []) as { factuur_id: string; url: string }[]).map((l) => [l.factuur_id, l.url]));
  const { data: hData } = facturen.length ? await supabase.from("factuur_herinneringen").select("factuur_id, niveau, verstuurd_op").in("factuur_id", facturen.map((f) => f.id)).order("niveau") : { data: [] };
  const herinneringen = (hData ?? []) as Herinnering[];
  const { data: moRij } = await supabase.from("montages").select("id, status, start_datum, eind_datum, leverdatum").eq("project_id", projectId).neq("status", "geannuleerd").maybeSingle();
  const montage = moRij as { id: string; status: string; start_datum: string; eind_datum: string; leverdatum: string | null } | null;
  // Openstaande opleverpunten kunnen de eindfactuur tegenhouden: kantoor beslist.
  let openOpleverpunten = 0;
  if (montage) {
    const { data: wb } = await supabase.from("werkbonnen").select("id").eq("montage_id", montage.id).maybeSingle();
    if (wb) {
      const { count } = await supabase.from("opleverpunten").select("id", { count: "exact", head: true }).eq("werkbon_id", wb.id).eq("status", "open");
      openOpleverpunten = count ?? 0;
    }
  }
  const { data: pRij } = await supabase.from("projecten").select("naam").eq("id", projectId).maybeSingle();
  const projectNaam = (pRij as { naam?: string } | null)?.naam ?? "";
  const mag = rol === "directie" || rol === "kantoor";
  const { data: magPrijzenData } = facturen.length ? await supabase.rpc("mag_prijzen_aanpassen", { p_tenant: facturen[0].tenant_id }) : { data: false };
  const magPrijzen = magPrijzenData === true;
  // Het logboek is alleen voor de directie leesbaar; voor anderen levert dit niets op.
  const { data: wData } = facturen.length ? await supabase.from("factuur_wijzigingen").select("factuur_id, oud, nieuw, reden, door, op").in("factuur_id", facturen.map((f) => f.id)).order("op") : { data: [] };
  const wijzigingen = (wData ?? []) as Wijziging[];
  const { data: ledenData } = wijzigingen.length ? await supabase.rpc("leden_voor_planning") : { data: [] };
  const leden = (ledenData ?? []) as { user_id: string; email: string }[];
  const vandaag = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Amsterdam" }).format(new Date());
  const lopend = (nr: number) => facturen.find((f) => f.termijn === nr && f.status !== "geannuleerd" && f.status !== "gecrediteerd");
  const m = melding ? MELDINGEN[melding] : null;
  const totaalGefactureerd = facturen.filter((f) => f.status !== "geannuleerd").reduce((s, f) => s + Number(f.totaal_incl) - Number(f.gecrediteerd), 0);
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
          const open = f ? openstaand(Number(f.totaal_incl), gedaan, Number(f.gecrediteerd)) : 0;
          const teLaat = f ? isTeLaat(f.status, f.vervaldatum, vandaag) : false;
          return (
            <li key={t.nr} className="rounded-lg border border-stone-200 p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="font-semibold">Termijn {t.nr}: {t.naam} ({t.pct}%)</div>
                  {montage && t.nr === 2 && <div className="text-xs text-blue-800">Montage start op {datum(montage.start_datum)}{montage.status === "voorlopig" ? " (voorlopig: leverdatum nog niet bekend)" : ""}.</div>}
                  {t.nr === 3 && openOpleverpunten > 0 && <div className="mt-1 rounded bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-900">Let op: er {openOpleverpunten === 1 ? "staat nog 1 opleverpunt" : `staan nog ${openOpleverpunten} opleverpunten`} open. Overweeg de eindfactuur te laten wachten tot ze zijn opgelost.</div>}
                  {montage && t.nr === 3 && <div className="text-xs text-blue-800">{montage.status === "afgerond" ? "De montage is afgerond." : `Montage loopt t/m ${datum(montage.eind_datum)}.`}</div>}
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
                    <Link href={`/facturen/${f.id}`} className="font-mono font-bold underline">{f.nummer}</Link>
                    <span>factuurdatum {datum(f.factuurdatum)}</span>
                    <span className={teLaat ? "font-semibold text-red-700" : ""}>vervalt {datum(f.vervaldatum)}{teLaat ? " (te laat)" : ""}</span>
                    <a href={`/facturen/${f.id}/pdf`} target="_blank" rel="noreferrer" className="underline">PDF</a>
                  </div>
                  {f.status === "open" && <div className="mt-1 font-semibold">Openstaand {euroTekst(open)}</div>}
                  {Number(f.gecrediteerd) > 0 && <div className="text-stone-600">Gecrediteerd {euroTekst(Number(f.gecrediteerd))}</div>}
                  {betalingen.filter((b) => b.factuur_id === f.id).map((b, i) => (
                    <div key={i} className="text-stone-600">Betaald {euroTekst(Number(b.bedrag))} op {datum(b.betaald_op)}{b.notitie ? ` · ${b.notitie}` : ""}</div>
                  ))}
                  {wijzigingen.filter((w) => w.factuur_id === f.id).length > 0 && (
                    <details className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900">
                      <summary className="cursor-pointer font-semibold">Aangepast ({wijzigingen.filter((w) => w.factuur_id === f.id).length}x) · alleen zichtbaar voor de directie</summary>
                      <ul className="mt-1 grid gap-1">
                        {wijzigingen.filter((w) => w.factuur_id === f.id).map((w, i) => {
                          const o = w.oud, n = w.nieuw;
                          const delen: string[] = [];
                          if (n.status === "geannuleerd") delen.push("geannuleerd");
                          if (n.verzonden === true) delen.push("als verzonden gemarkeerd");
                          if (typeof n.creditnota === "string") delen.push(`creditnota ${n.creditnota}`);
                          if (o.totaal_incl !== undefined && n.totaal_incl !== undefined && Number(o.totaal_incl) !== Number(n.totaal_incl)) delen.push(`bedrag ${euroTekst(Number(o.totaal_incl))} → ${euroTekst(Number(n.totaal_incl))}`);
                          if (o.vervaldatum !== undefined && o.vervaldatum !== n.vervaldatum) delen.push(`vervaldatum ${String(o.vervaldatum)} → ${String(n.vervaldatum)}`);
                          if (o.omschrijving !== undefined && o.omschrijving !== n.omschrijving) delen.push("omschrijving");
                          if (o.omschrijving !== undefined && (o.toelichting ?? "") !== (n.toelichting ?? "")) delen.push("begeleidende tekst");
                          return <li key={i}>{datum(w.op.slice(0, 10))} · {leden.find((l) => l.user_id === w.door)?.email ?? "onbekend"}: {delen.join(", ") || "aangepast"}{w.reden ? `. Reden: ${w.reden}` : ""}</li>;
                        })}
                      </ul>
                    </details>
                  )}
                  {f.status === "open" && (
                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
                      {f.verzonden_op ? <span className="text-green-700">Verzonden op {datum(f.verzonden_op.slice(0, 10))}</span> : <span className="text-amber-800">Nog niet verzonden</span>}
                      {herinneringen.filter((h) => h.factuur_id === f.id).map((h) => <span key={h.niveau} className="text-stone-600">Herinnering {h.niveau}: {datum(h.verstuurd_op.slice(0, 10))}</span>)}
                    </div>
                  )}
                  {f.status === "open" && mag && (() => {
                    const groet = begroeting(f.debiteur?.aanhef, f.debiteur?.achternaam, f.debiteur?.naam ?? "");
                    const mailTekst = maakFactuurMail({ begroeting: groet, nummer: f.nummer, termijn: f.termijn, omschrijving: f.omschrijving, bedrag: Number(f.totaal_incl), vervaldatum: datum(f.vervaldatum), adres: projectNaam, bedrijf: BEDRIJF_FACTUUR.naam, betaalLink: betaallinks.get(f.id) ?? null });
                    const volgende = Math.min(3, herinneringen.filter((h) => h.factuur_id === f.id).length + 1);
                    const laatsteH = herinneringen.filter((h) => h.factuur_id === f.id).length >= 3;
                    const herMail = teLaat && f.verzonden_op && !laatsteH ? maakHerinneringMail({ begroeting: groet, nummer: f.nummer, bedrag: open, vervaldatum: datum(f.vervaldatum), bedrijf: BEDRIJF_FACTUUR.naam, niveau: volgende, betaalLink: betaallinks.get(f.id) ?? null }) : null;
                    return (
                      <div className="mt-3 grid gap-2">
                        <details className="rounded-md border border-stone-200 px-3 py-2">
                          <summary className="cursor-pointer font-semibold">Mailtekst met de factuur</summary>
                          <p className="mt-2 text-xs text-stone-500">Kopieer de tekst, voeg de PDF als bijlage toe en verstuur de mail zelf. Leg daarna vast dat hij is verzonden.</p>
                          <label className="mt-2 block text-xs font-semibold">Onderwerp<input readOnly value={mailTekst.onderwerp} className="mt-1 w-full rounded-md border border-stone-300 bg-stone-50 px-3 py-2 text-sm" /></label>
                          <label className="mt-2 block text-xs font-semibold">Tekst<textarea readOnly rows={9} value={mailTekst.tekst} className="mt-1 w-full rounded-md border border-stone-300 bg-stone-50 px-3 py-2 text-sm" /></label>
                          {!f.verzonden_op && (
                            <form action={markeerVerzonden} className="mt-2">
                              <input type="hidden" name="project_id" value={projectId} /><input type="hidden" name="factuur_id" value={f.id} />
                              <button className="rounded-md bg-[#24332B] px-4 py-2 text-sm font-semibold text-white">Markeer als verzonden</button>
                            </form>
                          )}
                          {f.verzonden_op && <p className="mt-2 text-xs text-amber-800">Pas je de factuur na het verzenden nog aan, stuur de klant dan de nieuwe PDF.</p>}
                        </details>
                        {herMail && (
                          <details className="rounded-md border border-red-200 bg-red-50 px-3 py-2" open>
                            <summary className="cursor-pointer font-semibold text-red-800">Herinnering {volgende} klaarzetten ({dagenTeLaat(f.vervaldatum, vandaag)} dagen te laat)</summary>
                            <label className="mt-2 block text-xs font-semibold">Onderwerp<input readOnly value={herMail.onderwerp} className="mt-1 w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm" /></label>
                            <label className="mt-2 block text-xs font-semibold">Tekst<textarea readOnly rows={8} value={herMail.tekst} className="mt-1 w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm" /></label>
                            <form action={registreerHerinnering} className="mt-2">
                              <input type="hidden" name="project_id" value={projectId} /><input type="hidden" name="factuur_id" value={f.id} />
                              <button className="rounded-md bg-red-700 px-4 py-2 text-sm font-semibold text-white">Herinnering is verstuurd</button>
                            </form>
                          </details>
                        )}
                      </div>
                    );
                  })()}
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
                      <details className="rounded-md border border-stone-200 px-3 py-2 sm:col-span-2">
                        <summary className="cursor-pointer font-semibold">Factuur aanpassen</summary>
                        <form action={wijzigFactuur} className="mt-2 grid gap-2">
                          <input type="hidden" name="project_id" value={projectId} /><input type="hidden" name="factuur_id" value={f.id} />
                          <label className="text-xs font-semibold">Omschrijving<input name="omschrijving" required defaultValue={f.omschrijving} className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2 text-sm" /></label>
                          <label className="text-xs font-semibold">Begeleidende tekst<textarea name="toelichting" rows={4} defaultValue={f.toelichting ?? ""} className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2 text-sm" /></label>
                          <label className="text-xs font-semibold">Vervaldatum<input type="date" name="vervaldatum" required defaultValue={f.vervaldatum} className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2 text-sm" /></label>
                          {magPrijzen ? (
                            <>
                              <label className="text-xs font-semibold">Totaalbedrag incl. btw<input name="totaal" inputMode="decimal" defaultValue={String(Number(f.totaal_incl)).replace(".", ",")} className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2 text-sm" /></label>
                              <label className="text-xs font-semibold">Reden van een bedragswijziging<input name="reden" className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2 text-sm" /></label>
                              <p className="text-xs text-stone-500">Verander je het bedrag, dan is een reden verplicht. Het btw-bedrag wordt opnieuw berekend. Elke wijziging komt in het logboek van de directie.</p>
                            </>
                          ) : (
                            <p className="text-xs text-stone-500">Je kunt de tekst en de vervaldatum aanpassen. Voor een ander bedrag heb je de toestemming &quot;prijzen aanpassen&quot; nodig.</p>
                          )}
                          <button className="rounded-md bg-[#24332B] px-4 py-2 text-sm font-semibold text-white">Opslaan</button>
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

      {facturen.some((f) => f.status === "gecrediteerd") && (
        <div className="mt-4 text-xs text-stone-500">Gecrediteerd: {facturen.filter((f) => f.status === "gecrediteerd").map((f) => `${f.nummer} (termijn ${f.termijn})`).join("; ")}</div>
      )}
      {facturen.some((f) => f.status === "geannuleerd") && (
        <div className="mt-4 text-xs text-stone-500">
          Geannuleerd: {facturen.filter((f) => f.status === "geannuleerd").map((f) => `${f.nummer} (termijn ${f.termijn}${f.annulering_reden ? `, ${f.annulering_reden}` : ""})`).join("; ")}
        </div>
      )}
    </section>
  );
}
