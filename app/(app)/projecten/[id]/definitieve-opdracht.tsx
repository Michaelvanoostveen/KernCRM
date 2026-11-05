import { maakServerClient } from "@/lib/supabase/server";
import { haalPrijsregels } from "@/lib/prijs";
import { kozijnSvg } from "@/lib/tekening/tekenen";
import { maakDefinitieveOpdracht } from "@/lib/inmeting/definitief";
import { leesWijzigingen } from "@/lib/inmeting/wijzigingen";
import { berekenOfferte, euroTekst } from "@/lib/offerte/bereken";
import { INSTELLINGEN_KERNKOZIJNEN } from "@/lib/offerte/instellingen";
import { regelsUitDb, type RegelRij } from "@/lib/offerte/uit-db";

const prijs = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${euroTekst(Math.abs(n))}`;

/**
 * De definitieve opdracht na de inmeting: de getekende offerte plus de door de klant goedgekeurde wijzigingen en extra's.
 * De getekende offerte blijft ongewijzigd (die is vergrendeld); dit is de aanvulling waarop gemaakt wordt.
 */
export default async function DefinitieveOpdracht({ inmetingId, offerteId }: { inmetingId: string; offerteId: string }) {
  const supabase = await maakServerClient();
  const [{ data: wData }, { data: pData }, { data: oData }, { data: rData }] = await Promise.all([
    supabase.rpc("inmeting_wijzigingen_lijst", { p_inmeting: inmetingId }),
    supabase.from("posities").select("id, nummer, ruimte, aantal, config").eq("offerte_id", offerteId),
    supabase.from("offertes").select("totaal_override").eq("id", offerteId).maybeSingle(),
    supabase.from("offerte_regels").select("soort, aantal, prijs, prijs_override, korting_modus, korting_waarde, posities(prijs, aantal)").eq("offerte_id", offerteId),
  ]);
  const regels = haalPrijsregels();
  const opdracht = maakDefinitieveOpdracht(regels, (pData ?? []) as { id: string; nummer: number; ruimte: string | null; aantal: number; config: unknown }[], leesWijzigingen(wData));
  if (opdracht.gewijzigd.length === 0 && opdracht.extras.length === 0) return null;

  const override = oData?.totaal_override;
  const offerteTotaal = berekenOfferte(regelsUitDb((rData ?? []) as unknown as RegelRij[]), INSTELLINGEN_KERNKOZIJNEN, { totaalOverride: override === null || override === undefined ? null : Number(override) }).totaal;

  return (
    <div className="mt-5 border-t border-stone-200 pt-4">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-stone-500">Definitieve opdracht</h3>
      <p className="mt-1 text-xs text-stone-500">De getekende offerte blijft ongewijzigd. Hieronder staat wat de klant extra heeft goedgekeurd; hierop wordt gemaakt en besteld.</p>

      {opdracht.gewijzigd.length > 0 && (
        <ul className="mt-3 grid gap-3 sm:grid-cols-2">
          {opdracht.gewijzigd.map((g) => {
            let svg: string | null = null;
            try { svg = kozijnSvg(regels, g.config, `Positie ${g.nummer}`); } catch { svg = null; }
            return (
              <li key={g.positieId} className="flex gap-3 rounded-lg border border-stone-200 p-3 text-sm">
                {svg && <div className="w-24 shrink-0 rounded bg-[#efebe3] p-1" dangerouslySetInnerHTML={{ __html: svg }} />}
                <div className="min-w-0">
                  <div className="font-semibold">Pos. {g.nummer}{g.ruimte ? ` · ${g.ruimte}` : ""}{g.aantal > 1 ? ` · ${g.aantal}×` : ""}</div>
                  <div className="text-stone-500">Offerte: {g.was}</div>
                  <div className="mt-1 font-medium">Wordt: {g.wijziging}</div>
                  <div className="mt-1 tabular-nums text-stone-600">{prijs(g.meerprijs)}</div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {opdracht.extras.length > 0 && (
        <ul className="mt-3 divide-y divide-stone-100 rounded-lg border border-stone-200 text-sm">
          {opdracht.extras.map((e) => (
            <li key={e.id} className="flex justify-between gap-3 px-3 py-2">
              <span>Extra: {e.omschrijving}{e.aantal > 1 ? ` (${e.aantal}×)` : ""}{e.positieNummer ? ` · pos. ${e.positieNummer}` : " · hele project"}</span>
              <span className="tabular-nums">{prijs(e.meerprijs)}</span>
            </li>
          ))}
        </ul>
      )}

      <dl className="mt-3 ml-auto max-w-xs text-sm">
        <div className="flex justify-between py-0.5"><dt>Getekende offerte</dt><dd className="tabular-nums">{euroTekst(offerteTotaal)}</dd></div>
        <div className="flex justify-between py-0.5"><dt>Goedgekeurd meerwerk</dt><dd className="tabular-nums">{prijs(opdracht.meerwerk)}</dd></div>
        <div className="flex justify-between border-t border-stone-300 py-1 font-bold"><dt>Totaal opdracht (incl. btw)</dt><dd className="tabular-nums">{euroTekst(offerteTotaal + opdracht.meerwerk)}</dd></div>
      </dl>
    </div>
  );
}
