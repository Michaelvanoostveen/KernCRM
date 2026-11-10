"use client";

import { startTransition, useActionState, useState } from "react";
import HandtekeningVeld from "@/components/handtekening-veld";
import { URENSTAPPEN, urenOverzicht, urenTekst, type Opleverpunt, type WerkbonUren } from "@/lib/montage/werkbon";
import { bewaarWerkbonAlgemeen, bewaarWerkbonUren, leverOp, verwijderWerkbonUren, voegPuntToe, zetPuntOpgelost, type WerkbonStatus } from "../actions";
import WerkbonFotoBlok, { type WerkbonFotoItem } from "./werkbon-foto-blok";

const veld = "w-full rounded-lg border border-stone-300 bg-white px-3 py-3 text-base disabled:bg-stone-100";
const datum = (iso: string) => new Intl.DateTimeFormat("nl-NL", { weekday: "short", day: "numeric", month: "short", timeZone: "Europe/Amsterdam" }).format(new Date(`${iso}T12:00:00Z`));

/** Uren per dag: de ploeg ziet elkaars uren, een monteur schrijft zijn eigen uren. */
export function WerkbonUrenBlok({ montageId, uren, startDatum, vandaag, vergrendeld }: { montageId: string; uren: WerkbonUren[]; startDatum: string; vandaag: string; vergrendeld: boolean }) {
  const [status, actie, bezig] = useActionState<WerkbonStatus, FormData>(bewaarWerkbonUren, {});
  const o = urenOverzicht(uren);
  return (
    <section className="mt-6 rounded-xl border border-stone-200 bg-white p-4" aria-label="Uren">
      <h2 className="text-lg font-bold">Uren</h2>
      {uren.length === 0 ? <p className="mt-1 text-sm text-stone-500">Nog geen uren geschreven.</p> : (
        <>
          <ul className="mt-2 divide-y divide-stone-100 text-sm">
            {uren.map((u) => (
              <li key={`${u.monteur_id}-${u.datum}`} className="flex items-center justify-between gap-3 py-2">
                <span><b>{u.monteur}</b> · {datum(u.datum)}{u.notitie ? ` · ${u.notitie}` : ""}</span>
                <span className="flex items-center gap-3">
                  <span className="font-semibold tabular-nums">{urenTekst(u.uren)}</span>
                  {!vergrendeld && (
                    <form action={verwijderWerkbonUren}>
                      <input type="hidden" name="montage_id" value={montageId} /><input type="hidden" name="datum" value={u.datum} />
                      <button className="text-xs text-red-700 underline">Weg</button>
                    </form>
                  )}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-1 text-right text-sm font-bold">Totaal {urenTekst(o.totaal)}</p>
        </>
      )}
      {!vergrendeld && (
        <form action={actie} className="mt-3 grid grid-cols-2 gap-3">
          <input type="hidden" name="montage_id" value={montageId} />
          <label className="text-sm font-semibold">Dag
            <input type="date" name="datum" defaultValue={vandaag < startDatum ? startDatum : vandaag} min={startDatum} max={vandaag} required className={`${veld} mt-1`} />
          </label>
          <label className="text-sm font-semibold">Mijn uren
            <select name="uren" defaultValue="8" className={`${veld} mt-1`}>
              {URENSTAPPEN.map((u) => <option key={u} value={u}>{urenTekst(u)}</option>)}
            </select>
          </label>
          <label className="col-span-2 text-sm text-stone-600">Notitie (optioneel)
            <input name="notitie" maxLength={300} className={`${veld} mt-1`} />
          </label>
          {status.fout && <p role="alert" className="col-span-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{status.fout}</p>}
          <div className="col-span-2 flex items-center gap-3">
            <button disabled={bezig} className="rounded-lg bg-[#24332B] px-5 py-2.5 text-base font-bold text-white disabled:opacity-60">{bezig ? "Opslaan…" : "Uren opslaan"}</button>
            {status.opgeslagen && <span role="status" className="text-sm font-semibold text-green-700">✓ Opgeslagen</span>}
          </div>
        </form>
      )}
    </section>
  );
}

/** Bijzonderheden voor kantoor, een vraag aan kantoor (bijvoorbeeld mogelijk meerwerk) en of er is opgeruimd. */
export function WerkbonAlgemeen({ montageId, bijzonderheden, kantoorActie, opgeruimd, vergrendeld }: { montageId: string; bijzonderheden: string | null; kantoorActie: boolean; opgeruimd: boolean; vergrendeld: boolean }) {
  const [wijzig, setWijzig] = useState(false);
  const [status, actie, bezig] = useActionState<WerkbonStatus, FormData>(async (vorige, formData) => {
    const uitkomst = await bewaarWerkbonAlgemeen(vorige, formData);
    if (uitkomst.opgeslagen) startTransition(() => setWijzig(false));
    return uitkomst;
  }, {});
  return (
    <section className="mt-6 rounded-xl border border-stone-200 bg-white p-4" aria-label="Bijzonderheden">
      <h2 className="text-lg font-bold">Bijzonderheden</h2>
      <form action={actie} onChange={() => setWijzig(true)} className="mt-2 grid gap-3">
        <input type="hidden" name="montage_id" value={montageId} />
        <textarea name="bijzonderheden" rows={4} defaultValue={bijzonderheden ?? ""} disabled={vergrendeld} aria-label="Bijzonderheden" placeholder="Wat moet kantoor weten? Bijvoorbeeld: extra werk gedaan, klant wil nog iets, schade gevonden" className={veld} />
        <label className="flex items-center gap-3 text-base"><input type="checkbox" name="kantoor_actie" defaultChecked={kantoorActie} disabled={vergrendeld} className="h-6 w-6 accent-[#B35B40]" /> Kantoor moet hierop reageren (bijvoorbeeld mogelijk meerwerk)</label>
        <label className="flex items-center gap-3 text-base"><input type="checkbox" name="opgeruimd" defaultChecked={opgeruimd} disabled={vergrendeld} className="h-6 w-6 accent-[#B35B40]" /> Opgeruimd en schoon achtergelaten</label>
        {status.fout && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{status.fout}</p>}
        {!vergrendeld && (
          <div className="flex items-center gap-3">
            <button disabled={bezig} className="rounded-lg bg-[#B35B40] px-5 py-2.5 text-base font-bold text-white hover:brightness-110 disabled:opacity-60">{bezig ? "Opslaan…" : "Opslaan"}</button>
            {!wijzig && status.opgeslagen && <span role="status" className="text-sm font-semibold text-green-700">✓ Opgeslagen</span>}
            {wijzig && !bezig && <span className="text-sm text-amber-800">Nog niet opgeslagen</span>}
          </div>
        )}
      </form>
    </section>
  );
}

/** Opleverpunten: wat nog moet gebeuren. Elk punt kan een foto krijgen. */
export function WerkbonPunten({ montageId, punten, posities, fotos, vergrendeld, kantoor }: {
  montageId: string; punten: Opleverpunt[]; posities: { id: string; label: string }[]; fotos: WerkbonFotoItem[]; vergrendeld: boolean; kantoor: boolean;
}) {
  const [status, actie, bezig] = useActionState<WerkbonStatus, FormData>(voegPuntToe, {});
  const label = (pid: string | null) => posities.find((p) => p.id === pid)?.label ?? "Hele project";
  const mag = !vergrendeld || kantoor;
  return (
    <section className="mt-6 rounded-xl border border-stone-200 bg-white p-4" aria-label="Opleverpunten">
      <h2 className="text-lg font-bold">Opleverpunten</h2>
      <p className="mt-1 text-sm text-stone-600">Iets dat nog moet gebeuren of dat niet goed is? Meld het hier, met een foto. Zo kun je het kozijn toch opleveren.</p>
      {punten.length > 0 && (
        <ul className="mt-2 divide-y divide-stone-100">
          {punten.map((p) => (
            <li key={p.id} className="flex items-start justify-between gap-3 py-2 text-sm">
              <div>
                <div className={`font-semibold ${p.status === "opgelost" ? "text-stone-500 line-through" : ""}`}>{p.omschrijving}</div>
                <div className="text-stone-600">{label(p.positie_id)} · {p.status === "opgelost" ? "opgelost" : "open"}</div>
              </div>
              {mag && (
                <form action={zetPuntOpgelost}>
                  <input type="hidden" name="montage_id" value={montageId} /><input type="hidden" name="punt_id" value={p.id} />
                  <input type="hidden" name="opgelost" value={p.status === "open" ? "ja" : "nee"} />
                  <button className="rounded-md border border-stone-300 bg-white px-3 py-1.5 text-xs font-semibold hover:bg-stone-50">{p.status === "open" ? "Opgelost" : "Weer open"}</button>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}
      {!vergrendeld && (
        <>
          <form action={actie} className="mt-3 grid gap-3">
            <input type="hidden" name="montage_id" value={montageId} />
            <label className="text-sm font-semibold">Bij welk kozijn?
              <select name="positie_id" defaultValue="" className={`${veld} mt-1`}>
                <option value="">Hele project</option>
                {posities.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
              </select>
            </label>
            <label className="text-sm font-semibold">Wat moet er gebeuren?
              <input name="omschrijving" required maxLength={500} placeholder="Bijvoorbeeld: kras in het kozijn, afstellen scharnier" className={`${veld} mt-1`} />
            </label>
            {status.fout && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{status.fout}</p>}
            <div className="flex items-center gap-3">
              <button disabled={bezig} className="rounded-lg bg-[#24332B] px-5 py-2.5 text-base font-bold text-white disabled:opacity-60">{bezig ? "Opslaan…" : "Opleverpunt melden"}</button>
              {status.opgeslagen && <span role="status" className="text-sm font-semibold text-green-700">✓ Gemeld</span>}
            </div>
          </form>
          <WerkbonFotoBlok montageId={montageId} positieId={null} soort="punt" fotos={fotos} vergrendeld={false} titel="Foto's bij opleverpunten" />
        </>
      )}
      {vergrendeld && fotos.length > 0 && <WerkbonFotoBlok montageId={montageId} positieId={null} soort="punt" fotos={fotos} vergrendeld titel="Foto's bij opleverpunten" />}
    </section>
  );
}

/** Opleveren: de klant tekent op het scherm. Pas mogelijk als elk kozijn is geplaatst en wat nog moet, als opleverpunt is gemeld. */
export function WerkbonOpleveren({ montageId, klantNaam, onvolledig, openPunten }: { montageId: string; klantNaam: string; onvolledig: number; openPunten: number }) {
  const [status, actie, bezig] = useActionState<WerkbonStatus, FormData>(leverOp, {});
  const [naam, setNaam] = useState("");
  const [vink, setVink] = useState(false);
  const [handtekening, setHandtekening] = useState("");
  const klaar = onvolledig === 0 && naam.trim().length >= 3 && vink && handtekening !== "";

  return (
    <section className="mt-6 rounded-xl border-2 border-[#B35B40] bg-white p-4" aria-label="Opleveren">
      <h2 className="text-lg font-bold">Opleveren</h2>
      {onvolledig > 0 ? (
        <p role="status" className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">Je kunt nog niet opleveren: bij {onvolledig} {onvolledig === 1 ? "kozijn" : "kozijnen"} is de checklist niet af. Elk kozijn moet geplaatst zijn; wat nog niet is afgewerkt, meld je als opleverpunt.</p>
      ) : (
        <form action={actie} className="mt-2">
          <input type="hidden" name="montage_id" value={montageId} />
          <p className="text-sm text-stone-700">Geef de telefoon aan {klantNaam}. De klant bekijkt het werk en tekent voor de oplevering.{openPunten > 0 ? ` Er ${openPunten === 1 ? "staat nog 1 opleverpunt" : `staan nog ${openPunten} opleverpunten`} open: dit is dan een oplevering met voorbehoud.` : ""}</p>
          <label className="mt-3 block text-sm font-semibold">Naam klant
            <input name="naam" value={naam} onChange={(e) => setNaam(e.target.value)} autoComplete="off" placeholder="Voor- en achternaam" className={`${veld} mt-1`} />
          </label>
          <div className="mt-3 text-sm font-semibold">Handtekening (met vinger)</div>
          <HandtekeningVeld onChange={setHandtekening} />
          <label className="mt-3 flex items-start gap-3 text-sm">
            <input type="checkbox" name="akkoord" checked={vink} onChange={(e) => setVink(e.target.checked)} className="mt-0.5 h-6 w-6 shrink-0 accent-[#B35B40]" />
            <span>Ik ga akkoord met de oplevering{openPunten > 0 ? ", met de gemelde opleverpunten als voorbehoud" : ""}.</span>
          </label>
          <p className="mt-2 text-xs text-stone-500">Naam, handtekening, tijdstip, IP-adres en apparaat worden vastgelegd als bewijs.</p>
          {status.fout && <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{status.fout}</p>}
          <button disabled={!klaar || bezig} className="mt-3 w-full rounded-lg bg-[#B35B40] px-6 py-4 text-base font-bold text-white hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50">{bezig ? "Bezig…" : "Montage opleveren"}</button>
        </form>
      )}
    </section>
  );
}
