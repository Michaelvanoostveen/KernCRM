import { maakServerClient } from "@/lib/supabase/server";
import { eersteWerkdag, vandaagIso } from "@/lib/montage/week";
import { euroTekst } from "@/lib/offerte/bereken";
import { leesWerkbon, meerwerkTotaal, onvolledigeKozijnen, openPunten, regelKlaar, urenOverzicht, urenTekst } from "@/lib/montage/werkbon";
import { werkbonGezien, zetPuntOpgelost } from "../../monteur/actions";
import { annuleerMontage, planMontage, wijzigMontage } from "../../montage/actions";

type Ploeg = { id: string; naam: string };
type Montage = { id: string; ploeg_id: string; start_datum: string; werkdagen: number; eind_datum: string; leverdatum: string | null; hulpmiddel: string; status: string; notitie: string | null; annulering_reden: string | null };

const MELDINGEN: Record<string, { tekst: string; fout: boolean }> = {
  gepland: { tekst: "De montage is ingepland.", fout: false },
  gewijzigd: { tekst: "De montage is aangepast.", fout: false },
  gestart: { tekst: "De montage is gestart.", fout: false },
  afgerond: { tekst: "De montage is afgerond. Het project staat nu in de fase Oplevering.", fout: false },
  geannuleerd: { tekst: "De montage is geannuleerd.", fout: false },
  geen_akkoord: { tekst: "De montage kan pas worden gepland nadat de klant akkoord heeft gegeven op de offerte.", fout: true },
  inmeting_open: { tekst: "Rond eerst de inmeting af: de maten moeten definitief zijn voordat je de montage plant.", fout: true },
  fase: { tekst: "Dit project staat niet in een fase waarin de montage kan worden gepland.", fout: true },
  al_afgerond: { tekst: "Voor dit project is de montage al afgerond. Nawerk loopt via service.", fout: true },
  ploeg: { tekst: "Kies een ploeg die in dienst is.", fout: true },
  ploeg_bezet: { tekst: "Deze ploeg is in die periode al ingepland. Kies een andere ploeg of andere dagen.", fout: true },
  bestaat_al: { tekst: "Dit project heeft al een lopende montage.", fout: true },
  ongeldig: { tekst: "Controleer de gegevens: de startdag is een werkdag vanaf vandaag en de leverdatum ligt niet na de startdag.", fout: true },
  punt_bijgewerkt: { tekst: "Het opleverpunt is bijgewerkt.", fout: false },
  gezien: { tekst: "De melding van de monteur is als gezien gemarkeerd.", fout: false },
  voorlopig: { tekst: "Vul eerst de leverdatum van de kozijnen in: pas dan is de montage definitief.", fout: true },
  te_vroeg: { tekst: "De montage kan pas starten op of na de startdatum.", fout: true },
  niet_te_starten: { tekst: "Deze montage kan niet meer worden gestart.", fout: true },
  niet_bezig: { tekst: "Alleen een montage die bezig is, kan worden afgerond.", fout: true },
  via_werkbon: { tekst: "Een montage ronden we af door op te leveren: de monteur laat de klant tekenen op de werkbon. Start zo nodig de werkbon via de montageafspraak.", fout: true },
  werkbon_open: { tekst: "De werkbon staat nog open: de monteur levert op met de handtekening van de klant.", fout: true },
  niet_te_wijzigen: { tekst: "Deze montage kan niet meer worden aangepast.", fout: true },
  niet_te_annuleren: { tekst: "Deze montage kan niet meer worden geannuleerd.", fout: true },
  reden: { tekst: "Vul een reden in om de montage te annuleren.", fout: true },
  geen_toegang: { tekst: "Je hebt geen toestemming om de montage te plannen.", fout: true },
  mislukt: { tekst: "Het lukte niet. Probeer het opnieuw.", fout: true },
};
const STATUS: Record<string, { label: string; kleur: string }> = {
  voorlopig: { label: "Voorlopig", kleur: "bg-amber-100 text-amber-900" },
  definitief: { label: "Definitief", kleur: "bg-blue-100 text-blue-800" },
  bezig: { label: "Bezig", kleur: "bg-green-100 text-green-800" },
  afgerond: { label: "Afgerond", kleur: "bg-stone-200 text-stone-700" },
};
const HULP: Record<string, string> = { geen: "Geen", steiger: "Steiger", hoogwerker: "Hoogwerker", beide: "Steiger en hoogwerker" };
const datum = (iso: string) => new Intl.DateTimeFormat("nl-NL", { weekday: "short", day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Amsterdam" }).format(new Date(`${iso}T12:00:00Z`));
const veld = "mt-1 w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm";

function Velden({ ploegen, m, vandaag }: { ploegen: Ploeg[]; m?: Montage; vandaag: string }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="text-xs font-semibold">Ploeg
        <select name="ploeg_id" required defaultValue={m?.ploeg_id ?? ""} className={veld}>
          <option value="" disabled>Kies een ploeg…</option>
          {ploegen.map((p) => <option key={p.id} value={p.id}>{p.naam}</option>)}
        </select>
      </label>
      <label className="text-xs font-semibold">Eerste montagedag (werkdag)
        <input type="date" name="start_datum" required defaultValue={m?.start_datum ?? eersteWerkdag(vandaag)} min={vandaag} className={veld} />
      </label>
      <label className="text-xs font-semibold">Aantal werkdagen
        <input type="number" name="werkdagen" min={1} max={30} required defaultValue={m?.werkdagen ?? 2} className={veld} />
      </label>
      <label className="text-xs font-semibold">Leverdatum kozijnen (leeg = nog niet bekend)
        <input type="date" name="leverdatum" defaultValue={m?.leverdatum ?? ""} className={veld} />
      </label>
      <label className="text-xs font-semibold">Steiger of hoogwerker
        <select name="hulpmiddel" defaultValue={m?.hulpmiddel ?? "geen"} className={veld}>
          {Object.entries(HULP).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </label>
      <label className="text-xs font-semibold">Notitie voor de ploeg
        <input name="notitie" defaultValue={m?.notitie ?? ""} className={veld} />
      </label>
    </div>
  );
}

/** Montage van een project: plannen, aanpassen, starten, afronden en annuleren. De planning zelf is voor directie en kantoor. */
export default async function MontageBlok({ projectId, offerteId, rol, melding }: { projectId: string; offerteId: string; rol: string | null; melding: string | null }) {
  const supabase = await maakServerClient();
  const mag = rol === "directie" || rol === "kantoor";
  const [{ data: iData }, { data: pData }, { data: mData }] = await Promise.all([
    supabase.from("inmetingen").select("id").eq("offerte_id", offerteId).eq("status", "uitgevoerd").limit(1),
    supabase.from("montageploegen").select("id, naam").eq("actief", true).order("naam"),
    supabase.from("montages").select("id, ploeg_id, start_datum, werkdagen, eind_datum, leverdatum, hulpmiddel, status, notitie, annulering_reden").eq("project_id", projectId).order("aangemaakt", { ascending: false }),
  ]);
  const inmetingKlaar = (iData ?? []).length > 0;
  const ploegen = (pData ?? []) as Ploeg[];
  const montages = (mData ?? []) as Montage[];
  const huidige = montages.find((m) => m.status !== "geannuleerd");
  const geannuleerd = montages.filter((m) => m.status === "geannuleerd");
  const m = melding ? MELDINGEN[melding] : null;
  // De werkbon van de lopende of afgeronde montage, zoals de monteur hem invult.
  const { data: wData } = huidige ? await supabase.rpc("werkbon_laad", { p_montage: huidige.id }) : { data: null };
  const werkbon = leesWerkbon(wData);
  const werkbonUren = werkbon ? urenOverzicht(werkbon.uren) : null;
  const vandaag = vandaagIso(new Date());

  if (!huidige && !inmetingKlaar && !m) return null;
  const ploegNaam = (id: string) => ploegen.find((p) => p.id === id)?.naam ?? "ploeg";

  return (
    <section id="montage" className="mt-6 rounded-lg border border-stone-200 bg-white p-5" aria-label="Montage">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-500">Montage</h2>
      {m && <p role={m.fout ? "alert" : "status"} className={`mt-3 rounded-md px-4 py-2.5 text-sm ${m.fout ? "bg-red-50 text-red-800" : "bg-green-50 text-green-800"}`}>{m.tekst}</p>}

      {!huidige && inmetingKlaar && mag && ploegen.length === 0 && (
        <p className="mt-3 text-sm text-stone-600">Er zijn nog geen montageploegen. Voeg er een toe op het <a href="/montage" className="underline">planbord</a>.</p>
      )}
      {!huidige && inmetingKlaar && mag && ploegen.length > 0 && (
        <form action={planMontage} className="mt-3 grid gap-3">
          <input type="hidden" name="project_id" value={projectId} />
          <Velden ploegen={ploegen} vandaag={vandaag} />
          <p className="text-xs text-stone-500">Zonder leverdatum is de montage voorlopig: de ploeg staat gereserveerd, maar de montage kan pas starten als de leverdatum bekend is.</p>
          <div><button className="rounded-md bg-[#B35B40] px-4 py-2 text-sm font-semibold text-white hover:brightness-110">Montage inplannen</button></div>
        </form>
      )}
      {!huidige && inmetingKlaar && !mag && <p className="mt-3 text-sm text-stone-500">De montage is nog niet gepland.</p>}

      {huidige && (
        <div className="mt-3 text-sm">
          <div className="flex flex-wrap items-center gap-3">
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS[huidige.status]?.kleur ?? ""}`}>{STATUS[huidige.status]?.label ?? huidige.status}</span>
            <b>{ploegNaam(huidige.ploeg_id)}</b>
            <span>{datum(huidige.start_datum)}{huidige.eind_datum !== huidige.start_datum ? ` t/m ${datum(huidige.eind_datum)}` : ""} ({huidige.werkdagen} {huidige.werkdagen === 1 ? "werkdag" : "werkdagen"})</span>
          </div>
          <div className="mt-1 text-stone-600">
            {huidige.leverdatum ? `Kozijnen geleverd op ${datum(huidige.leverdatum)}.` : "Leverdatum van de kozijnen nog niet bekend."} Hulpmiddel: {HULP[huidige.hulpmiddel] ?? huidige.hulpmiddel}.{huidige.notitie ? ` Notitie: ${huidige.notitie}` : ""}
          </div>
          {werkbon && (
            <div className="mt-3 rounded-lg border border-stone-200 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="font-semibold">Werkbon · {werkbon.status === "opgeleverd" ? "opgeleverd" : "wordt ingevuld"}</div>
                <span className="flex gap-3 text-sm">
                  <a href={`/montage/${huidige.id}/pdf`} target="_blank" rel="noreferrer" className="underline">PDF</a>
                  <a href={`/monteur/${huidige.id}`} className="underline">Open de werkbon</a>
                </span>
              </div>
              <div className="mt-1 text-sm text-stone-700">
                {werkbon.regels.filter(regelKlaar).length} van {werkbon.regels.length} kozijnen helemaal af
                {werkbonUren && werkbonUren.totaal > 0 ? ` · ${urenTekst(werkbonUren.totaal)} gewerkt (${werkbonUren.perMonteur.map((x) => `${x.monteur} ${urenTekst(x.uren)}`).join(", ")})` : ""}
                {werkbon.status === "open" && werkbon.regels.length > 0 ? ` · ${onvolledigeKozijnen(werkbon.regels, werkbon.punten)} kozijn(en) nog niet klaar voor oplevering` : ""}
                {werkbon.opgeruimd ? " · opgeruimd" : ""}
              </div>
              {werkbon.bijzonderheden && (
                <div className={`mt-2 rounded-md px-3 py-2 text-sm ${werkbon.kantoor_actie && !werkbon.kantoor_gezien_op ? "border border-amber-300 bg-amber-50 text-amber-950" : "bg-stone-50 text-stone-800"}`}>
                  <div className="text-xs font-semibold uppercase tracking-wide text-stone-500">Bijzonderheden van de monteur{werkbon.kantoor_actie ? " · kantoor moet reageren" : ""}</div>
                  <div className="mt-1 whitespace-pre-line">{werkbon.bijzonderheden}</div>
                  {werkbon.kantoor_actie && !werkbon.kantoor_gezien_op && mag && (
                    <form action={werkbonGezien} className="mt-2">
                      <input type="hidden" name="montage_id" value={huidige.id} /><input type="hidden" name="project_id" value={projectId} />
                      <button className="rounded-md bg-[#24332B] px-3 py-1.5 text-xs font-semibold text-white">Gezien en opgepakt</button>
                    </form>
                  )}
                  {werkbon.kantoor_actie && werkbon.kantoor_gezien_op && <div className="mt-1 text-xs text-stone-500">Door kantoor gezien.</div>}
                </div>
              )}
              {werkbon.punten.length > 0 && (
                <ul className="mt-2 divide-y divide-stone-100 text-sm">
                  {werkbon.punten.map((pt) => (
                    <li key={pt.id} className="flex items-start justify-between gap-3 py-1.5">
                      <span className={pt.status === "opgelost" ? "text-stone-500 line-through" : "font-semibold text-red-800"}>Opleverpunt: {pt.omschrijving}</span>
                      {mag && (
                        <form action={zetPuntOpgelost}>
                          <input type="hidden" name="montage_id" value={huidige.id} /><input type="hidden" name="punt_id" value={pt.id} /><input type="hidden" name="project_id" value={projectId} /><input type="hidden" name="terug" value="project" />
                          <input type="hidden" name="opgelost" value={pt.status === "open" ? "ja" : "nee"} />
                          <button className="rounded-md border border-stone-300 bg-white px-3 py-1 text-xs font-semibold hover:bg-stone-50">{pt.status === "open" ? "Opgelost" : "Weer open"}</button>
                        </form>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {werkbon.meerwerk.length > 0 && (
                <div className="mt-2 rounded-md bg-stone-50 px-3 py-2 text-sm">
                  <div className="text-xs font-semibold uppercase tracking-wide text-stone-500">Meerwerk van de monteur</div>
                  <ul className="mt-1 divide-y divide-stone-100">
                    {werkbon.meerwerk.map((x) => (
                      <li key={x.id} className="flex justify-between gap-3 py-1">
                        <span>{x.omschrijving}{x.aantal > 1 ? ` (${x.aantal}×)` : ""} <span className={x.status === "akkoord" ? "text-green-700" : "text-amber-800"}>· {x.status === "akkoord" ? "klant akkoord" : "wacht op akkoord"}</span></span>
                        <span className="tabular-nums">{euroTekst(x.meerprijs, 2)}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-1 text-xs text-stone-600">Goedgekeurd: {euroTekst(meerwerkTotaal(werkbon.meerwerk, "akkoord"), 2)} incl. btw. Dit komt automatisch op de eindfactuur.</div>
                </div>
              )}
              {werkbon.status === "opgeleverd" && werkbon.akkoord && (
                <div className="mt-2 text-xs text-stone-600">Opgeleverd en getekend door {werkbon.akkoord.naam}{werkbon.akkoord.met_voorbehoud ? ` met voorbehoud (${openPunten(werkbon.punten)} opleverpunt(en) nu nog open)` : ""}. Handtekening, tijdstip, IP-adres en apparaat zijn vastgelegd.</div>
              )}
            </div>
          )}
          {huidige.status === "voorlopig" && <p className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900">Voorlopig: vul de leverdatum in zodra die bekend is. Pas dan is de montage definitief en kan hij starten.</p>}
          {(huidige.status === "definitief" || huidige.status === "bezig") && huidige.start_datum <= vandaag && (
            <p className="mt-2 rounded-md bg-blue-50 px-3 py-2 text-xs text-blue-900">De eerste montagedag is aangebroken: de factuur voor de levering (65%) hoort klaar te staan. <a href={`/projecten/${projectId}#facturen`} className="underline">Naar de facturen</a></p>
          )}

          {mag && (
            <div className="mt-3 grid gap-2">
              <div className="flex flex-wrap gap-2">
                {huidige.status === "definitief" && !werkbon && (
                  <a href={`/monteur/${huidige.id}`} className="rounded-md bg-[#24332B] px-4 py-2 text-sm font-semibold text-white">Werkbon starten en opleveren</a>
                )}
                {huidige.status === "bezig" && !werkbon && (
                  <a href={`/monteur/${huidige.id}`} className="rounded-md border border-stone-300 bg-white px-4 py-2 text-sm font-semibold hover:bg-stone-50">Werkbon starten en opleveren</a>
                )}
              </div>
              {(huidige.status === "voorlopig" || huidige.status === "definitief") && (
                <details className="rounded-md border border-stone-200 px-3 py-2">
                  <summary className="cursor-pointer font-semibold">Montage aanpassen</summary>
                  <form action={wijzigMontage} className="mt-2 grid gap-3">
                    <input type="hidden" name="project_id" value={projectId} /><input type="hidden" name="montage_id" value={huidige.id} />
                    <Velden ploegen={ploegen} m={huidige} vandaag={vandaag} />
                    <div><button className="rounded-md bg-[#24332B] px-4 py-2 text-sm font-semibold text-white">Opslaan</button></div>
                  </form>
                </details>
              )}
              {huidige.status !== "afgerond" && (
                <details className="rounded-md border border-stone-200 px-3 py-2">
                  <summary className="cursor-pointer font-semibold">Montage annuleren</summary>
                  <form action={annuleerMontage} className="mt-2 grid gap-2">
                    <input type="hidden" name="project_id" value={projectId} /><input type="hidden" name="montage_id" value={huidige.id} />
                    <label className="text-xs font-semibold">Reden<input name="reden" required className={veld} /></label>
                    <div><button className="rounded-md bg-red-700 px-4 py-2 text-sm font-semibold text-white">Annuleren</button></div>
                  </form>
                </details>
              )}
              <p className="text-xs text-stone-500">Werkdagen zijn maandag tot en met vrijdag. Feestdagen houdt KernCRM nog niet bij.</p>
            </div>
          )}
        </div>
      )}

      {geannuleerd.length > 0 && (
        <div className="mt-4 text-xs text-stone-500">Geannuleerd: {geannuleerd.map((g) => `${datum(g.start_datum)}${g.annulering_reden ? ` (${g.annulering_reden})` : ""}`).join("; ")}</div>
      )}
      {!inmetingKlaar && huidige && <p className="mt-3 text-xs text-stone-500">De inmeting is nog niet afgerond.</p>}
    </section>
  );
}
