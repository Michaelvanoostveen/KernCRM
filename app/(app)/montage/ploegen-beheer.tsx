import { maakServerClient } from "@/lib/supabase/server";
import { STANDAARD_MONTEURS } from "@/lib/montage/standaard";
import { hernoemMonteur, hernoemPloeg, koppelAccount, laadStandaardOpstelling, maakMonteur, maakPloeg, wijsMonteurToe, zetMonteurActief, zetPloegActief } from "./actions";

type Ploeg = { id: string; naam: string; actief: boolean };
type Monteur = { id: string; naam: string; actief: boolean; user_id: string | null };
type Lid = { monteur_id: string; ploeg_id: string };
type Account = { user_id: string; email: string; rol: string };

const veld = "rounded-md border border-stone-300 bg-white px-3 py-1.5 text-sm";
const knop = "rounded-md border border-stone-300 bg-white px-3 py-1.5 text-xs font-semibold hover:bg-stone-50";

/** Ploegen en monteurs beheren: namen aanpassen, monteurs in een ploeg zetten, inlogaccounts koppelen. Voor directie en kantoor. */
export default async function PloegenBeheer() {
  const supabase = await maakServerClient();
  const [{ data: pData }, { data: mData }, { data: lData }, { data: aData }] = await Promise.all([
    supabase.from("montageploegen").select("id, naam, actief").order("naam"),
    supabase.from("monteurs").select("id, naam, actief, user_id").order("naam"),
    supabase.from("ploeg_leden").select("monteur_id, ploeg_id"),
    supabase.rpc("leden_voor_planning"),
  ]);
  const ploegen = (pData ?? []) as Ploeg[];
  const monteurs = (mData ?? []) as Monteur[];
  const leden = (lData ?? []) as Lid[];
  const accounts = ((aData ?? []) as Account[]).filter((a) => a.rol === "monteur");
  const ploegVan = (monteurId: string) => leden.find((l) => l.monteur_id === monteurId)?.ploeg_id ?? "";
  const actievePloegen = ploegen.filter((p) => p.actief);
  const leeg = monteurs.length === 0 && STANDAARD_MONTEURS.length > 0;
  const vrij = (huidig: string | null) => accounts.filter((a) => a.user_id === huidig || !monteurs.some((m) => m.user_id === a.user_id));

  return (
    <section id="ploegen" className="mt-8" aria-label="Ploegen en monteurs">
      <h2 className="text-lg font-semibold">Ploegen en monteurs</h2>
      <p className="mt-1 text-sm text-stone-600">Namen en samenstelling pas je hier zelf aan. Een monteur zit in hooguit één ploeg; kies je een andere ploeg, dan verhuist hij.</p>

      {leeg && (
        <form action={laadStandaardOpstelling} className="mt-3 rounded-lg border border-dashed border-stone-300 bg-white p-4">
          <p className="text-sm">Nog geen monteurs. Laad de startopstelling: {STANDAARD_MONTEURS.join(", ")} in drie ploegen van twee (Jeremy is reserve). Daarna pas je alles aan.</p>
          <button className="mt-3 rounded-md bg-[#B35B40] px-4 py-2 text-sm font-semibold text-white hover:brightness-110">Startopstelling laden</button>
        </form>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-stone-500">Ploegen</h3>
          <ul className="mt-2 grid gap-2">
            {ploegen.map((p) => {
              const inPloeg = monteurs.filter((m) => ploegVan(m.id) === p.id);
              return (
                <li key={p.id} className="rounded-lg border border-stone-200 bg-white p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <form action={hernoemPloeg} className="flex flex-1 items-center gap-2">
                      <input type="hidden" name="ploeg_id" value={p.id} />
                      <input name="naam" defaultValue={p.naam} maxLength={60} aria-label={`Naam van ${p.naam}`} className={`${veld} min-w-0 flex-1 ${p.actief ? "font-semibold" : "text-stone-500 line-through"}`} />
                      <button className={knop}>Naam opslaan</button>
                    </form>
                    <form action={zetPloegActief}>
                      <input type="hidden" name="ploeg_id" value={p.id} /><input type="hidden" name="actief" value={p.actief ? "uit" : "aan"} />
                      <button className={knop}>{p.actief ? "Uit dienst" : "Weer in dienst"}</button>
                    </form>
                  </div>
                  <ul className="mt-2 text-sm">
                    {inPloeg.length === 0 && <li className="text-stone-500">Nog geen monteurs in deze ploeg.</li>}
                    {inPloeg.map((m) => (
                      <li key={m.id} className="flex items-center justify-between gap-2 py-0.5">
                        <span>{m.naam}{m.user_id ? "" : <span className="ml-2 text-xs text-stone-500">(geen account)</span>}</span>
                        <form action={wijsMonteurToe}><input type="hidden" name="monteur_id" value={m.id} /><input type="hidden" name="ploeg_id" value="" /><button className={knop}>Uit ploeg</button></form>
                      </li>
                    ))}
                  </ul>
                </li>
              );
            })}
            {ploegen.length === 0 && <li className="text-sm text-stone-500">Nog geen ploegen.</li>}
          </ul>
          <form action={maakPloeg} className="mt-3 flex flex-wrap items-end gap-2">
            <label className="text-xs font-semibold">Nieuwe ploeg<input name="naam" required maxLength={60} placeholder="Bijvoorbeeld: Ploeg 4" className={`${veld} mt-1 block w-60 max-w-full`} /></label>
            <button className="rounded-md bg-[#24332B] px-4 py-2 text-sm font-semibold text-white">Toevoegen</button>
          </form>
        </div>

        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-stone-500">Monteurs</h3>
          <ul className="mt-2 grid gap-2">
            {monteurs.map((m) => (
              <li key={m.id} className="rounded-lg border border-stone-200 bg-white p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <form action={hernoemMonteur} className="flex flex-1 items-center gap-2">
                    <input type="hidden" name="monteur_id" value={m.id} />
                    <input name="naam" defaultValue={m.naam} maxLength={60} aria-label={`Naam van ${m.naam}`} className={`${veld} min-w-0 flex-1 ${m.actief ? "font-semibold" : "text-stone-500 line-through"}`} />
                    <button className={knop}>Naam opslaan</button>
                  </form>
                  <form action={zetMonteurActief}>
                    <input type="hidden" name="monteur_id" value={m.id} /><input type="hidden" name="actief" value={m.actief ? "uit" : "aan"} />
                    <button className={knop}>{m.actief ? "Uit dienst" : "Weer in dienst"}</button>
                  </form>
                </div>
                {m.actief && (
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    <form action={wijsMonteurToe} className="flex items-center gap-2">
                      <input type="hidden" name="monteur_id" value={m.id} />
                      <select name="ploeg_id" defaultValue={ploegVan(m.id)} aria-label={`Ploeg van ${m.naam}`} className={`${veld} min-w-0 flex-1`}>
                        <option value="">Geen ploeg (reserve)</option>
                        {actievePloegen.map((p) => <option key={p.id} value={p.id}>{p.naam}</option>)}
                      </select>
                      <button className={knop}>Opslaan</button>
                    </form>
                    <form action={koppelAccount} className="flex items-center gap-2">
                      <input type="hidden" name="monteur_id" value={m.id} />
                      <select name="user_id" defaultValue={m.user_id ?? ""} aria-label={`Account van ${m.naam}`} className={`${veld} min-w-0 flex-1`}>
                        <option value="">Geen inlogaccount</option>
                        {vrij(m.user_id).map((a) => <option key={a.user_id} value={a.user_id}>{a.email}</option>)}
                      </select>
                      <button className={knop}>Koppelen</button>
                    </form>
                  </div>
                )}
              </li>
            ))}
            {monteurs.length === 0 && <li className="text-sm text-stone-500">Nog geen monteurs.</li>}
          </ul>
          <form action={maakMonteur} className="mt-3 flex flex-wrap items-end gap-2">
            <label className="text-xs font-semibold">Nieuwe monteur<input name="naam" required maxLength={60} placeholder="Voornaam" className={`${veld} mt-1 block w-60 max-w-full`} /></label>
            <button className="rounded-md bg-[#24332B] px-4 py-2 text-sm font-semibold text-white">Toevoegen</button>
          </form>
          <p className="mt-2 text-xs text-stone-500">Een inlogaccount voor een monteur maak je aan bij Gebruikers (rol monteur); daarna koppel je het hier aan zijn naam. Pas dan ziet hij zijn montages in de app.</p>
        </div>
      </div>
    </section>
  );
}
