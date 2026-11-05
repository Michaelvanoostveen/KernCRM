import { haalPrijsregels } from "@/lib/prijs";
import { kozijnSvg } from "@/lib/tekening/tekenen";
import { leesConfiguratie, positieOmschrijving } from "@/lib/projecten/positie";
import { INSTELLINGEN_KERNKOZIJNEN as inst } from "@/lib/offerte/instellingen";
import { euroTekst } from "@/lib/offerte/bereken";
import { berekenPubliek, vulInvoegvelden, type PubliekeOfferte, type PubliekeRegel } from "@/lib/offerte/publiek";
import AkkoordFormulier from "./akkoord-formulier";

const datum = (iso: string) => new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "long", year: "numeric" }).format(new Date(iso));
const eur0 = (n: number) => euroTekst(n, 0);

function tekeningVan(r: PubliekeRegel): string | null {
  if (!r.positie) return null;
  try {
    return kozijnSvg(haalPrijsregels(), { ...leesConfiguratie(r.positie.config) }, `Positie ${r.positie.nummer}`);
  } catch {
    return null;
  }
}
function omschrijvingVan(r: PubliekeRegel): string {
  try {
    return positieOmschrijving(haalPrijsregels(), leesConfiguratie(r.positie!.config));
  } catch {
    return "";
  }
}

/** De offerte zoals de klant hem ziet. Bevat nooit een aanpassing, reden of oorspronkelijke prijs: de gegevens bevatten alleen eindprijzen. */
export default function OfferteWeergave({ o, token, verlopen }: { o: PubliekeOfferte; token: string; verlopen: boolean }) {
  const b = berekenPubliek(o, inst);
  const eigenTotaal = o.eigen_totaal !== null;

  return (
    <div className="min-h-screen bg-[#F8F5F0] pb-12 text-[#23272A]">
      <header className="bg-[#24332B] px-6 py-4 text-white">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-2">
          <b className="text-lg">{o.bedrijf}</b>
          <span className="text-sm opacity-80">Offerte {o.nummer}-v{o.versie}{o.geldig_tot ? ` · geldig tot ${datum(o.geldig_tot)}` : ""}</span>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 pt-8">
        <h1 className="text-2xl font-bold">Uw offerte voor {o.project_naam}</h1>
        {o.verstuurd_op && <p className="mt-1 text-sm text-stone-600">Opgesteld op {datum(o.verstuurd_op)}</p>}

        <div className="mt-6">
          {o.regels.map((r, i) => {
            if (r.soort === "kop") return <h2 key={i} className="mb-2 mt-7 text-lg font-bold">{r.titel}</h2>;
            if (r.soort === "tekst") return (
              <div key={i} className="mt-5">
                {r.titel && <h2 className="mb-1 text-lg font-bold">{r.titel}</h2>}
                <p className="whitespace-pre-wrap leading-relaxed">{vulInvoegvelden(r.tekst ?? "", o)}</p>
              </div>
            );
            if (r.soort === "positie") {
              const svg = tekeningVan(r);
              return (
                <div key={i} className="mb-3 grid grid-cols-[6.5rem_minmax(0,1fr)_auto] items-center gap-4 rounded-xl border border-[#DFD8CB] bg-white p-3">
                  {svg ? <div className="rounded-md bg-[#EFEBE3] p-1" dangerouslySetInnerHTML={{ __html: svg }} /> : <div />}
                  <div className="min-w-0">
                    <div className="font-semibold">Pos. {r.positie?.nummer}{r.positie?.ruimte ? ` · ${r.positie.ruimte}` : ""}</div>
                    <div className="text-sm text-stone-600">{omschrijvingVan(r)}</div>
                  </div>
                  <div className="text-right font-semibold tabular-nums">{eur0(r.aantal * r.prijs)}{r.aantal > 1 && <div className="text-xs font-normal text-stone-500">{r.aantal} × {eur0(r.prijs)}</div>}</div>
                </div>
              );
            }
            if (r.soort === "artikel") return (
              <div key={i} className="flex justify-between gap-4 border-b border-[#DFD8CB] py-2 text-sm"><span>{r.aantal} × {r.titel}</span><span className="tabular-nums">{eur0(r.aantal * r.prijs)}</span></div>
            );
            return (
              <div key={i} className="flex justify-between gap-4 border-b border-[#DFD8CB] py-2 text-sm"><span>{r.titel}</span><span className="tabular-nums">− {eur0(r.modus === "bedrag" ? Number(r.waarde) : (b.subtotaal * Number(r.waarde)) / 100)}</span></div>
            );
          })}
        </div>

        <div className="mt-6 rounded-xl border border-[#DFD8CB] bg-white p-5">
          <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-sm">
            {!eigenTotaal && (<><dt>Subtotaal</dt><dd className="text-right tabular-nums">{euroTekst(b.subtotaal)}</dd></>)}
            {!eigenTotaal && b.korting > 0 && (<><dt>Korting</dt><dd className="text-right tabular-nums">− {euroTekst(b.korting)}</dd></>)}
            <dt>Totaal excl. btw</dt><dd className="text-right tabular-nums">{euroTekst(b.exclBtw)}</dd>
            <dt>Btw {Math.round(inst.btwHoog * 100)}% over {Math.round(inst.deelHoog * 100)}%</dt><dd className="text-right tabular-nums">{euroTekst(b.btwHoog)}</dd>
            <dt>Btw {Math.round(inst.btwLaag * 100)}% over {Math.round((1 - inst.deelHoog) * 100)}%</dt><dd className="text-right tabular-nums">{euroTekst(b.btwLaag)}</dd>
            <dt className="mt-1 border-t border-[#DFD8CB] pt-2 text-lg font-bold">Totaal incl. btw</dt><dd className="mt-1 border-t border-[#DFD8CB] pt-2 text-right text-xl font-bold tabular-nums">{euroTekst(b.totaal)}</dd>
          </dl>
          <div className="mt-4 border-t border-[#DFD8CB] pt-3 text-sm">
            <div className="mb-1 font-semibold">Betaalschema</div>
            {b.termijnen.map((t) => (
              <div key={t.naam} className="flex justify-between gap-4 py-0.5"><span>{t.pct}% · {t.naam}</span><span className="tabular-nums">{euroTekst(t.bedrag)}</span></div>
            ))}
          </div>
        </div>

        <div className="mt-8">
          {o.status === "akkoord" && o.akkoord ? (
            <div role="status" className="rounded-xl bg-[#DDEFE5] p-5 font-semibold text-[#1E5C3C]">
              Bedankt, {o.akkoord.naam}. Wij hebben uw handtekening op {datum(o.akkoord.op)} ontvangen. U ontvangt een factuur van {euroTekst(b.termijnen[0].bedrag)} (30%) voor de eerste termijn. Daarna nemen wij contact met u op om de inmeting te plannen.
            </div>
          ) : verlopen ? (
            <div role="status" className="rounded-xl bg-[#F6EAC9] p-5 font-semibold text-[#8A5A0B]">Deze offerte is verlopen. Neem contact met ons op voor een nieuwe offerte.</div>
          ) : (
            <AkkoordFormulier token={token} bedrag={euroTekst(b.totaal)} />
          )}
        </div>
        <p className="mt-6 text-sm text-stone-600">Vragen? Neem contact met ons op via de mail waarin u deze link ontving.</p>
      </main>
    </div>
  );
}