import { maakServerClient } from "@/lib/supabase/server";
import { haalPrijsregels } from "@/lib/prijs";
import { meerprijsConfiguratie } from "@/lib/inmeting/wijzigingen";
import { euroTekst } from "@/lib/offerte/bereken";
import { leesConfiguratie } from "@/lib/projecten/positie";

type Rij = { id: string; positie_id: string | null; soort: string; nieuwe_config: unknown; omschrijving: string; aantal: number; meerprijs: number | string; status: string; akkoord_id: string | null };
type Akkoord = { id: string; naam: string; op: string; totaal_meerprijs: number | string };

const dagTijd = (iso: string) => new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Amsterdam" }).format(new Date(iso));
const prijs = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${euroTekst(Math.abs(n))}`;

/** Wijzigingen en extra's die de inmeter heeft voorgesteld en de klant ter plekke heeft goedgekeurd. Voor kantoor, met controle op de prijs. */
export default async function WijzigingenKantoor({ inmetingId, offerteId }: { inmetingId: string; offerteId: string }) {
  const supabase = await maakServerClient();
  const [{ data: wData }, { data: aData }, { data: pData }] = await Promise.all([
    supabase.from("inmeting_wijzigingen").select("id, positie_id, soort, nieuwe_config, omschrijving, aantal, meerprijs, status, akkoord_id").eq("inmeting_id", inmetingId).neq("status", "vervallen").order("aangemaakt"),
    supabase.from("inmeting_akkoorden").select("id, naam, op, totaal_meerprijs").eq("inmeting_id", inmetingId).order("op"),
    supabase.from("posities").select("id, nummer, ruimte, aantal, config").eq("offerte_id", offerteId),
  ]);
  const rijen = (wData ?? []) as Rij[];
  if (rijen.length === 0) return null;
  const akkoorden = (aData ?? []) as Akkoord[];
  const posities = (pData ?? []) as { id: string; nummer: number; ruimte: string | null; aantal: number; config: unknown }[];
  const regels = haalPrijsregels();
  const label = (id: string | null) => { const p = posities.find((x) => x.id === id); return p ? `Pos. ${p.nummer}${p.ruimte ? ` · ${p.ruimte}` : ""}` : "Hele project"; };

  const rekenControle = (r: Rij): number | null => {
    if (r.soort !== "configuratie") return null;
    const p = posities.find((x) => x.id === r.positie_id);
    if (!p) return null;
    try { return meerprijsConfiguratie(regels, leesConfiguratie(p.config), leesConfiguratie(r.nieuwe_config), p.aantal); } catch { return null; }
  };
  const goedgekeurd = rijen.filter((r) => r.status === "akkoord");
  const totaal = goedgekeurd.reduce((s, r) => s + Number(r.meerprijs), 0);

  return (
    <div className="mt-5 border-t border-stone-200 pt-4">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-stone-500">Wijzigingen en extra&apos;s tijdens de inmeting</h3>
      <ul className="mt-2 divide-y divide-stone-100 text-sm">
        {rijen.map((r) => {
          const controle = rekenControle(r);
          const afwijkend = controle !== null && Math.abs(controle - Number(r.meerprijs)) > 0.01;
          return (
            <li key={r.id} className="flex items-start justify-between gap-3 py-2">
              <div className="min-w-0">
                <div className="font-semibold">{r.soort === "extra" ? `Extra: ${r.omschrijving}${r.aantal > 1 ? ` (${r.aantal}×)` : ""}` : `Wijziging: ${r.omschrijving}`}</div>
                <div className="text-stone-600">{label(r.positie_id)} · {r.status === "akkoord" ? "akkoord klant" : "wacht op akkoord"}</div>
                {afwijkend && <div className="mt-1 rounded bg-red-50 px-2 py-1 text-xs font-semibold text-red-800">Let op: de prijsmodule rekent {prijs(controle!)}. Controleer dit voor je het verwerkt.</div>}
              </div>
              <div className="shrink-0 font-bold tabular-nums">{prijs(Number(r.meerprijs))}</div>
            </li>
          );
        })}
      </ul>
      {goedgekeurd.length > 0 && <p className="mt-2 text-right text-sm font-bold">Goedgekeurd door de klant: {prijs(totaal)} incl. btw</p>}
      {akkoorden.map((a) => (
        <p key={a.id} className="mt-1 text-xs text-stone-500">Akkoord van {a.naam} op {dagTijd(a.op)} voor {prijs(Number(a.totaal_meerprijs))} incl. btw (handtekening, IP-adres en apparaat zijn vastgelegd).</p>
      ))}
      <p className="mt-2 text-xs text-stone-500">Het verwerken van deze wijzigingen in de offerte volgt in een volgende stap.</p>
    </div>
  );
}
