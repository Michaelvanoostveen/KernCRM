"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { maakBrowserClient } from "@/lib/supabase/browser";
import { verkleinFoto } from "@/lib/inmeting/foto";
import { FOTO_BUCKET_WERKBON, werkbonFotoPad } from "@/lib/montage/werkbon";
import { registreerWerkbonFoto, verwijderWerkbonFoto } from "../actions";

export interface WerkbonFotoItem { id: string; url: string }

/** Foto's voor, na of bij een opleverpunt. Ze worden op de telefoon verkleind en rechtstreeks naar de privé-opslag gestuurd. */
export default function WerkbonFotoBlok({ montageId, positieId, soort, fotos, vergrendeld, titel }: {
  montageId: string; positieId: string | null; soort: "voor" | "na" | "punt" | "overig"; fotos: WerkbonFotoItem[]; vergrendeld: boolean; titel: string;
}) {
  const router = useRouter();
  const invoer = useRef<HTMLInputElement>(null);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  const [, start] = useTransition();

  async function kies(bestanden: FileList | null) {
    if (!bestanden || bestanden.length === 0) return;
    setBezig(true);
    setFout(null);
    const supabase = maakBrowserClient();
    try {
      for (const bestand of Array.from(bestanden)) {
        if (!bestand.type.startsWith("image/")) { setFout("Kies een afbeelding."); continue; }
        const blob = await verkleinFoto(bestand);
        const id = crypto.randomUUID();
        const pad = werkbonFotoPad(montageId, id);
        const { error } = await supabase.storage.from(FOTO_BUCKET_WERKBON).upload(pad, blob, { contentType: "image/jpeg" });
        if (error) { setFout("Uploaden lukte niet. Controleer je verbinding en probeer het opnieuw."); continue; }
        const uitkomst = await registreerWerkbonFoto(montageId, positieId, soort, id);
        if (uitkomst.fout) {
          setFout(uitkomst.fout);
          // Het bestand staat in de opslag maar is niet vastgelegd: weer weghalen, zodat er niets achterblijft.
          await supabase.storage.from(FOTO_BUCKET_WERKBON).remove([pad]);
        }
      }
    } catch {
      setFout("De foto kon niet worden verwerkt. Probeer het opnieuw.");
    } finally {
      setBezig(false);
      if (invoer.current) invoer.current.value = "";
      start(() => router.refresh());
    }
  }

  async function weg(id: string) {
    setFout(null);
    const uitkomst = await verwijderWerkbonFoto(montageId, id);
    if (uitkomst.fout) setFout(uitkomst.fout);
    start(() => router.refresh());
  }

  return (
    <div className="mt-2">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-semibold">{titel}{fotos.length > 0 ? ` (${fotos.length})` : ""}</div>
        {!vergrendeld && (
          <>
            <input ref={invoer} type="file" accept="image/*" capture="environment" multiple className="hidden" onChange={(e) => kies(e.target.files)} />
            <button type="button" disabled={bezig} onClick={() => invoer.current?.click()} className="rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm font-semibold hover:bg-stone-50 disabled:opacity-60">{bezig ? "Uploaden…" : "Foto toevoegen"}</button>
          </>
        )}
      </div>
      {fout && <p role="alert" className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{fout}</p>}
      {fotos.length > 0 && (
        <ul className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4">
          {fotos.map((f) => (
            <li key={f.id} className="relative">
              {/* Tijdelijke ondertekende links naar een privé-opslag: next/image voegt hier niets toe. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <a href={f.url} target="_blank" rel="noreferrer"><img src={f.url} alt={titel} loading="lazy" className="aspect-square w-full rounded-lg object-cover" /></a>
              {!vergrendeld && <button type="button" onClick={() => weg(f.id)} aria-label="Foto verwijderen" className="absolute right-1 top-1 rounded-full bg-black/70 px-2 py-0.5 text-xs font-bold text-white">×</button>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
