"use client";

import Link from "next/link";
import { useActionState, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { berekenOfferte, euroTekst, kortingToegestaan } from "@/lib/offerte/bereken";
import { SJABLONEN, type SjabloonSleutel } from "@/lib/offerte/instellingen";
import type { Instellingen, OfferteRegel } from "@/lib/offerte/types";
import { bewaarOfferte, trekOfferteIn, verstuurOfferte, verwijderPositie, type OfferteStatus } from "../actions";

export type EditorRegel = OfferteRegel & { nummer?: number; ruimte?: string | null; omschrijving?: string; svg?: string | null; code?: string | null; eenheid?: string | null };
export type ArtikelOptie = { id: string; groep: string; code: string; naam: string; eenheid: string; prijsIncl: number };

const eur0 = (n: number) => euroTekst(n, 0);
const veld = "w-full rounded-md border border-stone-300 bg-[#FBFAF7] px-3 py-2 text-sm disabled:opacity-60";
const knop = "rounded-md border border-stone-300 bg-white px-3 py-1.5 text-sm font-semibold hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-50";
const soortLabel = (s: string) => ({ positie: "Positie", artikel: "Artikelregel", kop: "Kopregel", tekst: "Tekst", korting: "Korting" })[s] ?? s;
const getalOfNull = (t: string) => { const n = Number(t.replace(",", ".")); return t.trim() !== "" && Number.isFinite(n) && n >= 0 ? n : null; };

export default function OfferteEditor({ projectId, begin, rol, inst, vergrendeld, versie, statusLabel, opgeslagen, mag, artikelen, totaalOverride, isDirectie, redenen, totaalReden: bewaardeTotaalReden, statusRuw, link, geldigTot, gebeurtenissen, mail, melding: serverMelding }: {
  projectId: string;
  begin: EditorRegel[];
  rol: string | null;
  inst: Instellingen;
  vergrendeld: boolean;
  versie: number;
  statusLabel: string;
  opgeslagen: boolean;
  mag: boolean;
  artikelen: ArtikelOptie[];
  totaalOverride: number | null;
  /** Alleen de directie ziet de redenen van prijsaanpassingen. */
  isDirectie: boolean;
  redenen: Record<string, string>;
  totaalReden: string | null;
  statusRuw: string;
  link: string | null;
  geldigTot: string | null;
  gebeurtenissen: { soort: string; op: string; ip: string | null }[];
  mail: { onderwerp: string; tekst: string } | null;
  melding: string | null;
}) {
  const [regels, setRegels] = useState<EditorRegel[]>(begin);
  const [vuil, setVuil] = useState(false);
  const [menu, setMenu] = useState(false);
  const [kiezer, setKiezer] = useState(false);
  const [zoek, setZoek] = useState("");
  const [bevestig, setBevestig] = useState<string | null>(null);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [melding, setMelding] = useState("");
  const [totaalTekst, setTotaalTekst] = useState(totaalOverride === null ? "" : String(totaalOverride).replace(".", ","));
  const [totaalReden, setTotaalReden] = useState("");
  const [tafel, setTafel] = useState(false);
  const [verstuurBevestig, setVerstuurBevestig] = useState(false);
  const [intrekBevestig, setIntrekBevestig] = useState(false);
  const [gekopieerd, setGekopieerd] = useState("");
  const linkVeld = useRef<HTMLInputElement>(null);
  const mailVeld = useRef<HTMLTextAreaElement>(null);
  const intern = !tafel;
  const [totaalOpen, setTotaalOpen] = useState(totaalOverride !== null);
  const teller = useRef(0);
  const [status, actie, bezig] = useActionState<OfferteStatus, FormData>(bewaarOfferte, {});
  const [, start] = useTransition();

  const eigenTotaal = getalOfNull(totaalTekst);
  const b = useMemo(() => berekenOfferte(regels, inst, { totaalOverride: eigenTotaal }), [regels, inst, eigenTotaal]);
  const toegestaan = kortingToegestaan(b.verlagingPct, rol, inst);
  const boven = b.verlagingPct > inst.maxKortingGebruiker + 1e-9;
  const pctTekst = b.verlagingPct.toFixed(1).replace(".", ",");
  const kiesbaar = useMemo(() => {
    const q = zoek.trim().toLowerCase();
    return artikelen.filter((a) => !q || `${a.naam} ${a.code} ${a.groep}`.toLowerCase().includes(q)).slice(0, 12);
  }, [artikelen, zoek]);

  useEffect(() => {
    if (!vuil) return;
    const stop = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", stop);
    return () => window.removeEventListener("beforeunload", stop);
  }, [vuil]);

  const wijzig = (id: string, d: Partial<EditorRegel>) => { setRegels((rs) => rs.map((r) => (r.id === id ? { ...r, ...d } : r))); setVuil(true); };
  const verplaats = (i: number, richting: -1 | 1) => setRegels((rs) => {
    const j = i + richting;
    if (j < 0 || j >= rs.length) return rs;
    const kopie = [...rs];
    [kopie[i], kopie[j]] = [kopie[j], kopie[i]];
    setVuil(true);
    return kopie;
  });
  const verwijder = (id: string) => { setRegels((rs) => rs.filter((r) => r.id !== id)); setVuil(true); };
  const voegToe = (r: Omit<EditorRegel, "id" | "aantal" | "prijs"> & Partial<Pick<EditorRegel, "aantal" | "prijs">>) => {
    const eerstePositieTekst = regels.findIndex((x) => x.soort === "tekst" && x.titel);
    const nieuw: EditorRegel = { aantal: 1, prijs: 0, ...r, id: `nieuw-${++teller.current}` };
    // Prijsregels en kortingen horen bij de posities, vóór de tekstblokken met titel (voorwaarden, planning, betaling).
    setRegels((rs) => ((r.soort === "artikel" || r.soort === "korting") && eerstePositieTekst >= 0 ? [...rs.slice(0, eerstePositieTekst), nieuw, ...rs.slice(eerstePositieTekst)] : [...rs, nieuw]));
    setVuil(true);
    setMenu(false);
    setKiezer(false);
    setZoek("");
  };
  const verwijderPos = (positieId: string) => {
    const fd = new FormData();
    fd.set("project_id", projectId);
    fd.set("positie_id", positieId);
    start(() => { void verwijderPositie(fd); });
  };

  const zendProject = (actieFn: (fd: FormData) => Promise<void>) => {
    const fd = new FormData();
    fd.set("project_id", projectId);
    start(() => { void actieFn(fd); });
  };
  const kopieer = (tekst: string, veldRef: React.RefObject<HTMLInputElement | HTMLTextAreaElement | null>, naam: string) => {
    (navigator.clipboard ? navigator.clipboard.writeText(tekst) : Promise.reject(new Error("geen klembord")))
      .then(() => setGekopieerd(naam))
      .catch(() => { veldRef.current?.select(); setGekopieerd(`${naam}-handmatig`); });
  };
  const heeftRegels = regels.some((r) => r.soort === "positie" || r.soort === "artikel");
  const magVersturen = toegestaan && heeftRegels && b.totaal > 0;
  const geopend = gebeurtenissen.filter((g) => g.soort === "geopend");
  const akkoord = gebeurtenissen.find((g) => g.soort === "akkoord");
  const datumTijd = (iso: string) => new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

  const regelsJson = JSON.stringify(regels.map((r) => ({ id: r.id, soort: r.soort, titel: r.titel ?? null, tekst: r.tekst ?? null, aantal: r.aantal, prijs: r.prijs, modus: r.modus ?? null, waarde: r.waarde ?? null, artikelId: r.artikelId ?? null, prijsOverride: r.prijsOverride ?? null, overrideReden: r.overrideReden ?? null })));

  /** Prijs van een positie- of artikelregel, met de aanpassing (alleen met toestemming te wijzigen) eronder. */
  const prijsBlok = (r: EditorRegel) => {
    const aangepast = r.prijsOverride !== null && r.prijsOverride !== undefined;
    const effectief = r.prijsOverride ?? r.prijs;
    return (
      <div className="min-w-[8rem] text-right tabular-nums">
        <div className="font-semibold">{eur0(r.aantal * effectief)}</div>
        {r.aantal !== 1 && <div className="text-xs text-stone-500">{r.aantal} × {eur0(effectief)}</div>}
        {aangepast && intern && <div className="mt-0.5 text-xs text-stone-500"><span className="line-through">{eur0(r.aantal * r.prijs)}</span> <span className="rounded bg-amber-100 px-1.5 py-0.5 font-semibold text-amber-900">aangepast</span></div>}
      </div>
    );
  };
  const aanpasPaneel = (r: EditorRegel) => {
    const aangepast = r.prijsOverride !== null && r.prijsOverride !== undefined;
    if (!intern || (!aangepast && !mag)) return null;
    const bewaardeReden = redenen[r.id];
    return (
      <div className="mt-2">
        {aangepast && <p className="text-xs text-stone-600">Handmatige prijs: {eur0(r.prijsOverride!)} per stuk in plaats van {eur0(r.prijs)}.{isDirectie && bewaardeReden ? ` Reden: ${bewaardeReden}` : ""}</p>}
        {mag && !vergrendeld && (
          open[r.id] || aangepast ? (
            <div className="mt-2 grid gap-2 rounded-md bg-stone-50 p-3 sm:grid-cols-[8rem_minmax(0,1fr)_auto] sm:items-end">
              <label className="text-xs text-stone-500">Nieuwe prijs per stuk, incl. btw
                <input type="number" min={0} step="any" value={r.prijsOverride ?? ""} placeholder={String(r.prijs)} onChange={(e) => wijzig(r.id, { prijsOverride: e.target.value === "" ? null : Math.max(0, e.target.valueAsNumber || 0) })} className={veld} />
              </label>
              <label className="text-xs text-stone-500">Reden (verplicht bij een nieuwe prijs, alleen de directie ziet die)
                <input value={r.overrideReden ?? ""} onChange={(e) => wijzig(r.id, { overrideReden: e.target.value })} placeholder={bewaardeReden || aangepast ? "Alleen invullen als je de prijs wijzigt" : "Bijvoorbeeld: bestaande relatie"} className={veld} />
              </label>
              <button type="button" onClick={() => { wijzig(r.id, { prijsOverride: null, overrideReden: null }); setOpen((o) => ({ ...o, [r.id]: false })); }} className={knop}>Terugzetten</button>
            </div>
          ) : (
            <button type="button" onClick={() => setOpen((o) => ({ ...o, [r.id]: true }))} className="text-xs text-[#9C4B32] underline">Prijs handmatig aanpassen</button>
          )
        )}
      </div>
    );
  };

  return (
    <form action={actie} className="mt-6 grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <input type="hidden" name="project_id" value={projectId} />
      <input type="hidden" name="regels" value={regelsJson} />
      <input type="hidden" name="totaal_override" value={eigenTotaal === null ? "" : String(eigenTotaal)} />
      <input type="hidden" name="totaal_override_reden" value={eigenTotaal === null ? "" : totaalReden} />

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-stone-200 bg-white px-4 py-3">
          <div className="min-w-0 text-sm">
            <b>{tafel ? "Tafelmodus aan" : "Tafelmodus"}</b>
            <span className="ml-2 text-stone-600">{tafel ? "Interne informatie is verborgen: je kunt het scherm aan de klant laten zien." : "Verbergt aanpassingen, redenen en waarschuwingen als je het scherm aan de klant laat zien."}</span>
          </div>
          <button type="button" role="switch" aria-checked={tafel} onClick={() => setTafel((t) => !t)} className={`rounded-md border px-3 py-1.5 text-sm font-semibold ${tafel ? "border-[#24332B] bg-[#24332B] text-white" : "border-stone-300 bg-white hover:bg-stone-50"}`}>{tafel ? "Uitzetten" : "Aanzetten"}</button>
        </div>
        {serverMelding === "verstuurd" && <p role="status" className="rounded-md bg-green-50 px-4 py-2.5 text-sm text-green-800"><b>De offerte is verstuurd en vergrendeld.</b> Kopieer de link of de mailtekst hieronder en stuur die naar de klant.</p>}
        {serverMelding === "ingetrokken" && <p role="status" className="rounded-md bg-amber-50 px-4 py-2.5 text-sm text-amber-900">De offerte is ingetrokken en staat weer als concept. De oude link werkt niet meer.</p>}
        {serverMelding === "korting" && <p role="alert" className="rounded-md bg-red-50 px-4 py-2.5 text-sm text-red-800">Versturen niet gelukt: de prijs ligt meer dan {inst.maxKortingGebruiker}% onder de berekende prijs. Dat kan alleen de directie versturen.</p>}
        {serverMelding === "leeg" && <p role="alert" className="rounded-md bg-red-50 px-4 py-2.5 text-sm text-red-800">Versturen niet gelukt: de offerte heeft nog geen positie of artikel, of een totaal van € 0.</p>}
        {(serverMelding === "verzenden" || serverMelding === "intrekken") && <p role="alert" className="rounded-md bg-red-50 px-4 py-2.5 text-sm text-red-800">{serverMelding === "intrekken" ? "Intrekken niet gelukt. Alleen de directie kan een verstuurde offerte intrekken, en alleen zolang de klant niet heeft getekend." : "Versturen niet gelukt. Ververs de pagina en probeer het opnieuw."}</p>}
        {opgeslagen && !vuil && <p role="status" className="rounded-md bg-green-50 px-4 py-2.5 text-sm text-green-800">De offerte is opgeslagen.</p>}
        {vergrendeld && <p role="status" className="rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-900"><b>Deze offerte is {statusRuw === "akkoord" ? "getekend door de klant" : "verstuurd"} en vergrendeld.</b> {statusRuw === "verstuurd" ? "Alleen de directie kan hem intrekken om iets te wijzigen." : "Er kan niets meer aan worden gewijzigd."}</p>}
        {regels.length === 0 && (
          <p className="rounded-lg border border-dashed border-stone-300 bg-white p-8 text-center text-stone-600">De offerte is nog leeg. Voeg een positie of een tekstregel toe met &ldquo;+ Toevoegen&rdquo;.</p>
        )}

        {regels.map((r, i) => (
          <div key={r.id} className="grid grid-cols-[2rem_minmax(0,1fr)] gap-x-2 rounded-lg border border-stone-200 bg-white p-3 sm:grid-cols-[2rem_minmax(0,1fr)_auto]">
            <div className="flex flex-col items-center gap-1 pt-0.5">
              <button type="button" onClick={() => verplaats(i, -1)} disabled={vergrendeld || i === 0} aria-label="Regel omhoog" className="rounded px-1 text-stone-500 hover:bg-stone-100 disabled:opacity-30">▲</button>
              <button type="button" onClick={() => verplaats(i, 1)} disabled={vergrendeld || i === regels.length - 1} aria-label="Regel omlaag" className="rounded px-1 text-stone-500 hover:bg-stone-100 disabled:opacity-30">▼</button>
            </div>

            <div className="min-w-0">
              <div className="mb-1.5 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-stone-500">
                {soortLabel(r.soort)}{r.soort === "positie" && r.nummer ? <span className="rounded bg-stone-100 px-1.5 py-0.5">{r.nummer}</span> : null}
                {r.soort === "artikel" && r.code ? <span className="rounded bg-stone-100 px-1.5 py-0.5 normal-case tracking-normal">{r.code}</span> : null}
              </div>

              {r.soort === "positie" && (
                <div>
                  <div className="flex flex-wrap items-center gap-4">
                    {r.svg ? <div className="w-24 shrink-0 rounded-md bg-[#efebe3] p-1 sm:w-28" dangerouslySetInnerHTML={{ __html: r.svg }} /> : <div className="grid h-24 w-24 place-items-center rounded-md bg-stone-100 text-xs text-stone-500">Geen tekening</div>}
                    <div className="min-w-0 flex-1 basis-48">
                      <div className="font-semibold">Pos. {r.nummer}{r.ruimte ? ` · ${r.ruimte}` : ""}</div>
                      <div className="text-sm text-stone-600">{r.omschrijving}</div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Link href={`/projecten/${projectId}/positie/${r.positieId}`} onClick={(e) => { if (vuil) { e.preventDefault(); setMelding("Sla eerst je wijzigingen op, anders gaan ze verloren."); } }} className={`${knop} ${vergrendeld ? "pointer-events-none opacity-50" : ""}`}>Bewerken in configurator</Link>
                        {!vergrendeld && (bevestig === r.positieId ? (
                          <button type="button" onClick={() => { if (vuil) { setMelding("Sla eerst je wijzigingen op, anders gaan ze verloren."); setBevestig(null); } else verwijderPos(r.positieId!); }} className="rounded-md bg-red-700 px-3 py-1.5 text-sm font-semibold text-white">Ja, verwijderen</button>
                        ) : (
                          <button type="button" onClick={() => setBevestig(r.positieId ?? null)} className={knop}>Verwijderen</button>
                        ))}
                      </div>
                    </div>
                    {prijsBlok(r)}
                  </div>
                  {aanpasPaneel(r)}
                </div>
              )}

              {r.soort === "artikel" && (
                <div>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-[minmax(0,1fr)_5rem_auto] sm:items-end">
                    {r.artikelId ? (
                      <div className="col-span-2 sm:col-span-1"><div className="text-sm font-semibold">{r.titel}</div><div className="text-xs text-stone-500">{euroTekst(r.prijs)} per {r.eenheid ?? "stuk"}, uit de catalogus</div></div>
                    ) : (
                      <label className="col-span-2 text-xs text-stone-500 sm:col-span-1">Omschrijving
                        <input value={r.titel ?? ""} onChange={(e) => wijzig(r.id, { titel: e.target.value })} disabled={vergrendeld || !mag} className={veld} />
                        <span className="mt-1.5 block">Prijs per stuk, incl. btw
                          <input type="number" min={0} step="any" value={r.prijs} onChange={(e) => wijzig(r.id, { prijs: Math.max(0, e.target.valueAsNumber || 0) })} disabled={vergrendeld || !mag} className={veld} />
                        </span>
                      </label>
                    )}
                    <label className="text-xs text-stone-500">Aantal<input type="number" min={0.01} step="any" value={r.aantal} onChange={(e) => wijzig(r.id, { aantal: Math.max(0, e.target.valueAsNumber || 0) })} disabled={vergrendeld} className={veld} /></label>
                    {prijsBlok(r)}
                  </div>
                  {aanpasPaneel(r)}
                </div>
              )}

              {r.soort === "korting" && (
                <div>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-[minmax(0,1fr)_7rem_6rem_6rem] sm:items-end">
                    <label className="col-span-2 text-xs text-stone-500 sm:col-span-1">Omschrijving<input value={r.titel ?? ""} onChange={(e) => wijzig(r.id, { titel: e.target.value })} disabled={vergrendeld} className={veld} /></label>
                    <label className="text-xs text-stone-500">Soort
                      <select value={r.modus ?? "percentage"} onChange={(e) => wijzig(r.id, { modus: e.target.value as "percentage" | "bedrag" })} disabled={vergrendeld} className={veld}>
                        <option value="percentage">Procent</option><option value="bedrag">Bedrag</option>
                      </select>
                    </label>
                    <label className="text-xs text-stone-500">{r.modus === "bedrag" ? "Bedrag" : "Procent"}<input type="number" min={0} step="any" value={r.waarde ?? 0} onChange={(e) => wijzig(r.id, { waarde: Math.max(0, e.target.valueAsNumber || 0) })} disabled={vergrendeld} className={veld} /></label>
                    <div className="py-2 text-right font-semibold tabular-nums text-green-700">− {eur0(r.modus === "bedrag" ? r.waarde ?? 0 : (b.subtotaal * (r.waarde ?? 0)) / 100)}</div>
                  </div>
                  {intern && <p className="mt-1.5 text-xs text-stone-500">{rol === "directie" ? "Directie: geen grens." : `Korting en prijsaanpassingen samen: maximaal ${inst.maxKortingGebruiker}% onder de berekende prijs. Daarboven is de directie nodig.`}</p>}
                </div>
              )}

              {r.soort === "kop" && <input value={r.titel ?? ""} onChange={(e) => wijzig(r.id, { titel: e.target.value })} disabled={vergrendeld} aria-label="Kopregel" className={`${veld} text-lg font-bold`} />}

              {r.soort === "tekst" && (
                <div className="grid gap-2">
                  <input value={r.titel ?? ""} onChange={(e) => wijzig(r.id, { titel: e.target.value })} disabled={vergrendeld} placeholder="Titel (mag leeg blijven)" aria-label="Titel" className={`${veld} font-semibold`} />
                  <textarea value={r.tekst ?? ""} onChange={(e) => wijzig(r.id, { tekst: e.target.value })} disabled={vergrendeld} rows={4} aria-label="Tekst" className={`${veld} leading-relaxed`} />
                </div>
              )}
            </div>

            {r.soort !== "positie" && !vergrendeld && (
              <button type="button" onClick={() => verwijder(r.id)} className="col-span-2 mt-2 justify-self-end rounded-md px-2 py-1 text-sm text-stone-500 hover:bg-red-50 hover:text-red-700 sm:col-span-1 sm:mt-0 sm:self-start">Verwijderen</button>
            )}
          </div>
        ))}

        {!vergrendeld && (
          <div className="relative">
            <button type="button" onClick={() => { setMenu((m) => !m); setKiezer(false); }} aria-expanded={menu} className="rounded-md bg-[#B35B40] px-4 py-2 font-semibold text-white hover:brightness-110">+ Toevoegen</button>
            {menu && !kiezer && (
              <div className="absolute left-0 z-10 mt-2 w-[min(21rem,calc(100vw-2rem))] rounded-lg border border-stone-200 bg-white p-1.5 shadow-lg">
                <Link href={`/projecten/${projectId}/positie/nieuw`} onClick={(e) => { if (vuil) { e.preventDefault(); setMenu(false); setMelding("Sla eerst je wijzigingen op, anders gaan ze verloren."); } }} className="block rounded-md px-3 py-2 hover:bg-stone-100"><b className="text-sm">Positie (kozijn)</b><span className="block text-xs text-stone-500">Opent de configurator, met tekening en prijs</span></Link>
                <button type="button" onClick={() => setKiezer(true)} className="block w-full rounded-md px-3 py-2 text-left hover:bg-stone-100"><b className="text-sm">Artikel uit de catalogus</b><span className="block text-xs text-stone-500">Steiger, afvoer, afwerking, arbeid. Vaste prijs</span></button>
                {mag && <button type="button" onClick={() => voegToe({ soort: "artikel", titel: "", artikelId: null })} className="block w-full rounded-md px-3 py-2 text-left hover:bg-stone-100"><b className="text-sm">Artikel met eigen prijs</b><span className="block text-xs text-stone-500">Alleen met toestemming voor prijsaanpassing</span></button>}
                <button type="button" onClick={() => voegToe({ soort: "kop", titel: "Nieuwe kop" })} className="block w-full rounded-md px-3 py-2 text-left hover:bg-stone-100"><b className="text-sm">Kopregel</b><span className="block text-xs text-stone-500">Om posities te groeperen, bijvoorbeeld &ldquo;Voorzijde&rdquo;</span></button>
                <button type="button" onClick={() => voegToe({ soort: "tekst", tekst: "" })} className="block w-full rounded-md px-3 py-2 text-left hover:bg-stone-100"><b className="text-sm">Vrije tekst</b><span className="block text-xs text-stone-500">Uitleg of afspraken</span></button>
                <button type="button" onClick={() => voegToe({ soort: "korting", titel: "Korting", modus: "percentage", waarde: 5 })} className="block w-full rounded-md px-3 py-2 text-left hover:bg-stone-100"><b className="text-sm">Korting</b><span className="block text-xs text-stone-500">Procent of bedrag, over het totaal</span></button>
                <div className="mt-1 border-t border-stone-100 px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-stone-500">Tekstblok uit sjabloon</div>
                {(Object.keys(SJABLONEN) as SjabloonSleutel[]).map((k) => (
                  <button key={k} type="button" onClick={() => voegToe({ soort: "tekst", titel: SJABLONEN[k].titel, tekst: SJABLONEN[k].tekst })} className="block w-full rounded-md px-3 py-1.5 text-left text-sm hover:bg-stone-100">{SJABLONEN[k].titel}</button>
                ))}
              </div>
            )}
            {menu && kiezer && (
              <div className="absolute left-0 z-10 mt-2 w-[min(26rem,calc(100vw-2rem))] rounded-lg border border-stone-200 bg-white p-3 shadow-lg">
                <div className="mb-2 flex items-center justify-between"><b className="text-sm">Artikel uit de catalogus</b><button type="button" onClick={() => setKiezer(false)} className="text-xs text-stone-500 underline">Terug</button></div>
                <input autoFocus value={zoek} onChange={(e) => setZoek(e.target.value)} placeholder="Zoek op naam, code of groep" aria-label="Zoek een artikel" className={veld} />
                <ul className="mt-2 max-h-72 overflow-y-auto">
                  {kiesbaar.length === 0 && <li className="px-2 py-3 text-sm text-stone-500">Geen artikel gevonden.</li>}
                  {kiesbaar.map((a) => (
                    <li key={a.id}>
                      <button type="button" onClick={() => voegToe({ soort: "artikel", titel: a.naam, artikelId: a.id, prijs: a.prijsIncl, code: a.code, eenheid: a.eenheid })} className="grid w-full grid-cols-[minmax(0,1fr)_auto] gap-x-3 rounded-md px-2 py-2 text-left hover:bg-stone-100">
                        <span className="min-w-0"><span className="block truncate text-sm font-semibold">{a.naam}</span><span className="block truncate text-xs text-stone-500">{a.groep}</span></span>
                        <span className="text-right text-sm tabular-nums">{euroTekst(a.prijsIncl)}<span className="block text-xs text-stone-500">per {a.eenheid}</span></span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
        {melding && <p role="status" className="text-sm text-amber-800">{melding}</p>}
      </div>

      <aside className="flex flex-col gap-4 lg:sticky lg:top-4">
        <div className="rounded-lg border border-stone-200 bg-white p-5">
          <div className="mb-3 flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-stone-500"><span>Totaal</span><span className="rounded-full bg-stone-100 px-2.5 py-0.5 normal-case tracking-normal text-stone-700">v{versie} · {statusLabel}</span></div>
          <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-sm">
            {(intern || eigenTotaal === null) && (<><dt className="text-stone-500">Subtotaal</dt><dd className="text-right tabular-nums">{euroTekst(b.subtotaal)}</dd></>)}
            {b.korting > 0 && (intern || eigenTotaal === null) && (<><dt className="text-stone-500">Korting</dt><dd className="text-right tabular-nums text-green-700">− {euroTekst(b.korting)}</dd></>)}
            {intern && eigenTotaal !== null && b.aanpassing !== 0 && (<><dt className="text-stone-500">Aanpassing totaalprijs</dt><dd className={`text-right tabular-nums ${b.aanpassing < 0 ? "text-green-700" : ""}`}>{b.aanpassing < 0 ? "−" : "+"} {euroTekst(Math.abs(b.aanpassing))}</dd></>)}
            <dt className="text-stone-500">Totaal excl. btw</dt><dd className="text-right tabular-nums">{euroTekst(b.exclBtw)}</dd>
            <dt className="text-stone-500">Btw {Math.round(inst.btwHoog * 100)}% over {Math.round(inst.deelHoog * 100)}%</dt><dd className="text-right tabular-nums">{euroTekst(b.btwHoog)}</dd>
            <dt className="text-stone-500">Btw {Math.round(inst.btwLaag * 100)}% over {Math.round((1 - inst.deelHoog) * 100)}%</dt><dd className="text-right tabular-nums">{euroTekst(b.btwLaag)}</dd>
            <dt className="mt-1 self-end border-t border-stone-200 pt-2 text-[15px] font-bold">Totaal incl. btw</dt><dd className="mt-1 border-t border-stone-200 pt-2 text-right text-xl font-bold tabular-nums">{euroTekst(b.totaal)}</dd>
          </dl>
          {boven && intern && (
            <p role="status" className={`mt-3 rounded-md px-3 py-2 text-sm ${toegestaan ? "bg-blue-50 text-blue-900" : "bg-amber-50 text-amber-900"}`}>
              {toegestaan ? `Totale verlaging ${pctTekst}%: boven ${inst.maxKortingGebruiker}%, toegestaan voor de directie.` : <><b>De prijs ligt {pctTekst}% onder de berekende prijs.</b> De grens is {inst.maxKortingGebruiker}%. Opslaan kan, maar versturen vraagt goedkeuring van de directie.</>}
            </p>
          )}
          {intern && (mag || eigenTotaal !== null) && !vergrendeld && (
            <div className="mt-4 border-t border-stone-100 pt-3">
              {totaalOpen ? (
                <div className="grid gap-2">
                  <label className="text-xs text-stone-500">Eigen totaalprijs, incl. btw
                    <input inputMode="decimal" value={totaalTekst} onChange={(e) => { setTotaalTekst(e.target.value); setVuil(true); }} disabled={!mag} placeholder={String(b.totaal).replace(".", ",")} className={veld} />
                  </label>
                  <label className="text-xs text-stone-500">Reden (verplicht bij een nieuw bedrag, alleen de directie ziet die)
                    <input value={totaalReden} onChange={(e) => { setTotaalReden(e.target.value); setVuil(true); }} disabled={!mag} placeholder={bewaardeTotaalReden ? "Alleen invullen als je het bedrag wijzigt" : "Bijvoorbeeld: afronden"} className={veld} />
                  </label>
                  {isDirectie && bewaardeTotaalReden && <p className="text-xs text-stone-600">Bewaarde reden: {bewaardeTotaalReden}</p>}
                  <button type="button" onClick={() => { setTotaalTekst(""); setTotaalReden(""); setTotaalOpen(false); setVuil(true); }} className={knop}>Terugzetten</button>
                </div>
              ) : (
                <button type="button" onClick={() => setTotaalOpen(true)} className="text-xs text-[#9C4B32] underline">Totaalprijs handmatig aanpassen</button>
              )}
            </div>
          )}
        </div>

        <div className="rounded-lg border border-stone-200 bg-white p-5">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-stone-500">Betaalschema</div>
          {b.termijnen.map((t) => (
            <div key={t.naam} className="grid grid-cols-[1fr_auto] gap-x-3 border-t border-stone-100 py-2 text-sm first:border-t-0">
              <span>{t.pct}% · {t.naam}</span><b className="tabular-nums">{euroTekst(t.bedrag)}</b>
              <span className="col-span-2 text-xs text-stone-500">{t.toelichting}</span>
            </div>
          ))}
        </div>

        <div className="rounded-lg border border-stone-200 bg-white p-5">
          {status.fout && <p role="alert" className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{status.fout}</p>}
          <button disabled={vergrendeld || bezig || !vuil} className="w-full rounded-md bg-[#B35B40] px-4 py-2.5 font-semibold text-white hover:brightness-110 disabled:opacity-50">{bezig ? "Opslaan…" : vuil ? "Offerte opslaan" : "Alles is opgeslagen"}</button>
          {vuil && <p className="mt-2 text-xs text-amber-800">Je hebt niet-opgeslagen wijzigingen.</p>}
          {statusRuw === "concept" && (
            <div className="mt-3 border-t border-stone-100 pt-3">
              {!verstuurBevestig ? (
                <button type="button" onClick={() => setVerstuurBevestig(true)} disabled={vuil || !magVersturen} className="w-full rounded-md border border-[#24332B] bg-[#24332B] px-4 py-2.5 font-semibold text-white hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50">Offerte versturen…</button>
              ) : (
                <div className="rounded-md bg-stone-50 p-3 text-sm">
                  <p><b>Na versturen is de offerte vergrendeld.</b> De klant krijgt een eigen link die 14 dagen geldig is, waar hij de offerte ziet en kan tekenen.</p>
                  <div className="mt-3 flex gap-2">
                    <button type="button" onClick={() => zendProject(verstuurOfferte)} className="rounded-md bg-[#B35B40] px-4 py-2 font-semibold text-white hover:brightness-110">Ja, versturen</button>
                    <button type="button" onClick={() => setVerstuurBevestig(false)} className={knop}>Annuleren</button>
                  </div>
                </div>
              )}
              {vuil && <p className="mt-2 text-xs text-stone-500">Sla de offerte eerst op voordat je hem verstuurt.</p>}
              {!vuil && !heeftRegels && <p className="mt-2 text-xs text-stone-500">Voeg eerst een positie of artikel toe.</p>}
              {!vuil && heeftRegels && !toegestaan && <p className="mt-2 text-xs text-amber-800">De prijs ligt meer dan {inst.maxKortingGebruiker}% onder de berekende prijs. Alleen de directie kan deze offerte versturen.</p>}
            </div>
          )}
        </div>

        {statusRuw !== "concept" && link && (
          <div className="rounded-lg border border-stone-200 bg-white p-5">
            <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-stone-500">Online offerte</div>
            <div className="flex gap-2">
              <input ref={linkVeld} readOnly value={link} onFocus={(e) => e.currentTarget.select()} aria-label="Link naar de offerte" className={`${veld} min-w-0 flex-1 font-mono text-xs`} />
              <button type="button" onClick={() => kopieer(link, linkVeld, "link")} className={knop}>Kopieer</button>
            </div>
            {gekopieerd === "link" && <p role="status" className="mt-1 text-xs text-green-700">Link gekopieerd.</p>}
            {gekopieerd === "link-handmatig" && <p role="status" className="mt-1 text-xs text-amber-800">Selecteer de link en kopieer met Ctrl+C.</p>}
            {geldigTot && <p className="mt-2 text-xs text-stone-500">Geldig tot {new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "long", year: "numeric" }).format(new Date(geldigTot))}.</p>}

            {mail && (
              <div className="mt-4">
                <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-stone-500">Mailtekst</div>
                <input readOnly value={mail.onderwerp} aria-label="Onderwerp" className={`${veld} mb-2`} />
                <textarea ref={mailVeld} readOnly rows={9} value={mail.tekst} aria-label="Mailtekst" className={`${veld} text-xs leading-relaxed`} />
                <button type="button" onClick={() => kopieer(`${mail.onderwerp}\n\n${mail.tekst}`, mailVeld, "mail")} className={`${knop} mt-2`}>Kopieer onderwerp en tekst</button>
                {gekopieerd === "mail" && <span role="status" className="ml-2 text-xs text-green-700">Gekopieerd.</span>}
                {gekopieerd === "mail-handmatig" && <span role="status" className="ml-2 text-xs text-amber-800">Selecteer de tekst en kopieer met Ctrl+C.</span>}
                <p className="mt-2 text-xs text-stone-500">Mailen vanuit het CRM via Microsoft 365 volgt later. Plak dit tot dan in je eigen mail.</p>
              </div>
            )}

            <div className="mt-4 border-t border-stone-100 pt-3">
              <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-stone-500">Verloop</div>
              <ul className="space-y-1 text-sm">
                {akkoord && <li className="font-semibold text-green-700">Getekend door de klant · {datumTijd(akkoord.op)}{akkoord.ip ? ` · IP ${akkoord.ip}` : ""}</li>}
                <li>{geopend.length === 0 ? "De klant heeft de offerte nog niet geopend." : `Geopend door de klant: ${geopend.length}× · laatst ${datumTijd(geopend[0].op)}`}</li>
                {gebeurtenissen.filter((g) => g.soort === "verstuurd").slice(0, 1).map((g) => <li key={g.op} className="text-stone-600">Verstuurd · {datumTijd(g.op)}</li>)}
              </ul>
            </div>

            {isDirectie && statusRuw === "verstuurd" && (
              <div className="mt-4 border-t border-stone-100 pt-3">
                {!intrekBevestig ? (
                  <button type="button" onClick={() => setIntrekBevestig(true)} className="text-xs text-[#9C4B32] underline">Intrekken en weer bewerken</button>
                ) : (
                  <div className="rounded-md bg-amber-50 p-3 text-sm text-amber-900">
                    <p>De link werkt dan niet meer en de offerte wordt weer een concept. Weet je het zeker?</p>
                    <div className="mt-2 flex gap-2">
                      <button type="button" onClick={() => zendProject(trekOfferteIn)} className="rounded-md bg-red-700 px-3 py-1.5 text-sm font-semibold text-white">Ja, intrekken</button>
                      <button type="button" onClick={() => setIntrekBevestig(false)} className={knop}>Annuleren</button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </aside>
    </form>
  );
}
