"use client";

import { useActionState, useState } from "react";
import HandtekeningVeld from "@/components/handtekening-veld";
import { euroTekst } from "@/lib/offerte/bereken";
import { meerwerkTotaal, type Meerwerk } from "@/lib/montage/werkbon";
import { meerwerkAkkoord, verwijderMeerwerk, voegMeerwerkToe, type WerkbonStatus } from "../actions";

export type MeerwerkArtikel = { id: string; groep: string; naam: string; eenheid: string | null; prijs: number };

const veld = "w-full rounded-lg border border-stone-300 bg-white px-3 py-3 text-base";

/**
 * Meerwerk ter plekke: de monteur kiest een artikel uit de catalogus (de prijs staat vast), de klant ziet het totaal en tekent.
 * Opleveren kan pas als er geen meerwerk meer openstaat zonder handtekening.
 */
export default function WerkbonMeerwerk({ montageId, meerwerk, artikelen, posities, vergrendeld }: {
  montageId: string; meerwerk: Meerwerk[]; artikelen: MeerwerkArtikel[]; posities: { id: string; label: string }[]; vergrendeld: boolean;
}) {
  const [toeStatus, toeActie, toeBezig] = useActionState<WerkbonStatus, FormData>(voegMeerwerkToe, {});
  const [akStatus, akActie, akBezig] = useActionState<WerkbonStatus, FormData>(meerwerkAkkoord, {});
  const [zoek, setZoek] = useState("");
  const [naam, setNaam] = useState("");
  const [vink, setVink] = useState(false);
  const [handtekening, setHandtekening] = useState("");
  const open = meerwerk.filter((x) => x.status === "voorgesteld");
  const akkoord = meerwerk.filter((x) => x.status === "akkoord");
  const openTotaal = meerwerkTotaal(meerwerk, "voorgesteld");
  const gekozen = artikelen.filter((a) => `${a.groep} ${a.naam}`.toLowerCase().includes(zoek.trim().toLowerCase())).slice(0, 60);
  const label = (pid: string | null) => (pid ? posities.find((p) => p.id === pid)?.label ?? "Kozijn" : "Hele project");
  const klaar = naam.trim().length >= 3 && vink && handtekening !== "";

  if (vergrendeld && meerwerk.length === 0) return null;
  return (
    <section className="mt-6 rounded-xl border border-stone-200 bg-white p-4" aria-label="Meerwerk">
      <h2 className="text-lg font-bold">Meerwerk</h2>
      <p className="mt-1 text-sm text-stone-600">Vraagt de klant om extra werk of materiaal? Kies het hier. De klant ziet het bedrag (incl. btw) en tekent. Het komt op de eindfactuur.</p>

      {meerwerk.length > 0 && (
        <ul className="mt-3 divide-y divide-stone-100 text-sm">
          {meerwerk.map((x) => (
            <li key={x.id} className="flex items-start justify-between gap-3 py-2">
              <div>
                <div className="font-semibold">{x.omschrijving}{x.aantal > 1 ? ` (${x.aantal}×)` : ""}</div>
                <div className="text-stone-600">{label(x.positie_id)} · {x.status === "akkoord" ? "klant akkoord" : "wacht op akkoord"}</div>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-semibold tabular-nums">{euroTekst(x.meerprijs, 2)}</span>
                {!vergrendeld && x.status === "voorgesteld" && (
                  <form action={verwijderMeerwerk}>
                    <input type="hidden" name="montage_id" value={montageId} /><input type="hidden" name="meerwerk_id" value={x.id} />
                    <button className="rounded-md border border-stone-300 bg-white px-3 py-1.5 text-xs font-semibold hover:bg-stone-50">Verwijderen</button>
                  </form>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {akkoord.length > 0 && <p className="mt-2 text-sm font-semibold text-green-700">✓ Goedgekeurd door de klant: {euroTekst(meerwerkTotaal(meerwerk, "akkoord"), 2)}</p>}

      {!vergrendeld && (
        <form action={toeActie} className="mt-3 grid gap-3">
          <input type="hidden" name="montage_id" value={montageId} />
          <label className="text-sm font-semibold">Zoek een artikel
            <input value={zoek} onChange={(e) => setZoek(e.target.value)} placeholder="Bijvoorbeeld: vensterbank" className={`${veld} mt-1`} />
          </label>
          <label className="text-sm font-semibold">Artikel
            <select name="artikel_id" required defaultValue="" className={`${veld} mt-1`}>
              <option value="" disabled>{gekozen.length === 0 ? "Geen artikel gevonden" : "Kies een artikel"}</option>
              {gekozen.map((a) => <option key={a.id} value={a.id}>{a.naam}{a.eenheid ? ` (per ${a.eenheid})` : ""} · {euroTekst(a.prijs, 2)}</option>)}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm font-semibold">Aantal
              <input name="aantal" type="number" min={1} max={100} defaultValue={1} inputMode="numeric" className={`${veld} mt-1`} />
            </label>
            <label className="text-sm font-semibold">Bij welk kozijn?
              <select name="positie_id" defaultValue="" className={`${veld} mt-1`}>
                <option value="">Hele project</option>
                {posities.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
              </select>
            </label>
          </div>
          {toeStatus.fout && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{toeStatus.fout}</p>}
          <div className="flex items-center gap-3">
            <button disabled={toeBezig} className="rounded-lg bg-[#24332B] px-5 py-2.5 text-base font-bold text-white disabled:opacity-60">{toeBezig ? "Opslaan…" : "Meerwerk toevoegen"}</button>
            {toeStatus.opgeslagen && <span role="status" className="text-sm font-semibold text-green-700">✓ Toegevoegd</span>}
          </div>
        </form>
      )}

      {!vergrendeld && open.length > 0 && (
        <form action={akActie} className="mt-4 rounded-lg border-2 border-[#B35B40] p-3">
          <input type="hidden" name="montage_id" value={montageId} />
          <input type="hidden" name="verwacht_totaal" value={openTotaal} />
          <p className="text-sm text-stone-700">Geef de telefoon aan de klant. De klant ziet het meerwerk hierboven, <b>{euroTekst(openTotaal, 2)} incl. btw</b>, en tekent daarvoor.</p>
          <label className="mt-3 block text-sm font-semibold">Naam klant
            <input name="naam" value={naam} onChange={(e) => setNaam(e.target.value)} autoComplete="off" placeholder="Voor- en achternaam" className={`${veld} mt-1`} />
          </label>
          <div className="mt-3 text-sm font-semibold">Handtekening (met vinger)</div>
          <HandtekeningVeld onChange={setHandtekening} />
          <label className="mt-3 flex items-start gap-3 text-sm">
            <input type="checkbox" name="akkoord" checked={vink} onChange={(e) => setVink(e.target.checked)} className="mt-0.5 h-6 w-6 shrink-0 accent-[#B35B40]" />
            <span>Ik ga akkoord met het meerwerk en met het bedrag van {euroTekst(openTotaal, 2)} incl. btw.</span>
          </label>
          <p className="mt-2 text-xs text-stone-500">Naam, handtekening, tijdstip, IP-adres en apparaat worden vastgelegd als bewijs.</p>
          {akStatus.fout && <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{akStatus.fout}</p>}
          <button disabled={!klaar || akBezig} className="mt-3 w-full rounded-lg bg-[#B35B40] px-6 py-4 text-base font-bold text-white hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50">{akBezig ? "Bezig…" : "Klant tekent voor het meerwerk"}</button>
        </form>
      )}
    </section>
  );
}
