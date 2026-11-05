import { maakServerClient } from "@/lib/supabase/server";
import { FOTO_BUCKET } from "@/lib/inmeting/foto";

/** De foto's van de inmeting voor kantoor, per positie en algemeen. */
export default async function FotosKantoor({ inmetingId, offerteId }: { inmetingId: string; offerteId: string }) {
  const supabase = await maakServerClient();
  const [{ data: fData }, { data: pData }] = await Promise.all([
    supabase.rpc("inmeting_fotos_lijst", { p_inmeting: inmetingId }),
    supabase.from("posities").select("id, nummer, ruimte").eq("offerte_id", offerteId).order("nummer"),
  ]);
  const fotos = (Array.isArray(fData) ? fData : []) as { id: string; positie_id: string | null; pad: string }[];
  if (fotos.length === 0) return null;
  const { data: urls } = await supabase.storage.from(FOTO_BUCKET).createSignedUrls(fotos.map((f) => f.pad), 3600);
  const url = new Map((urls ?? []).flatMap((u) => (u.path && u.signedUrl ? [[u.path, u.signedUrl] as const] : [])));
  const posities = (pData ?? []) as { id: string; nummer: number; ruimte: string | null }[];
  const groepen = [{ sleutel: null as string | null, titel: "Algemeen" }, ...posities.map((p) => ({ sleutel: p.id as string | null, titel: `Pos. ${p.nummer}${p.ruimte ? ` · ${p.ruimte}` : ""}` }))];

  return (
    <div className="mt-5 border-t border-stone-200 pt-4">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-stone-500">Foto&apos;s van de inmeting ({fotos.length})</h3>
      {groepen.map((g) => {
        const lijst = fotos.filter((f) => f.positie_id === g.sleutel && url.get(f.pad));
        if (lijst.length === 0) return null;
        return (
          <div key={g.sleutel ?? "algemeen"} className="mt-3">
            <div className="text-sm font-semibold">{g.titel}</div>
            <ul className="mt-1 grid grid-cols-4 gap-2 sm:grid-cols-6">
              {lijst.map((f) => (
                <li key={f.id}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <a href={url.get(f.pad)} target="_blank" rel="noreferrer"><img src={url.get(f.pad)} alt={`Foto ${g.titel}`} loading="lazy" className="aspect-square w-full rounded-md object-cover" /></a>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
