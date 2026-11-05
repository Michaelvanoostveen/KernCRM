"use client";

import { useActionState, useState } from "react";
import type { FormStatus } from "../formulier-actions";
import { KLANTTYPES, isBedrijf } from "@/lib/klanten/klant";
import { zoekAdres } from "@/lib/klanten/adres";

const invoer = "rounded-md border border-stone-300 bg-white px-3 py-2 text-base font-normal";
const label = "flex flex-col gap-1 text-sm font-medium";
const sectie = "rounded-lg border border-stone-200 bg-white p-5";
const kop = "mb-4 text-sm font-semibold uppercase tracking-wide text-stone-500";

function Veld({ naam, titel, w, type = "text", autoComplete, className = "" }: {
  naam: string; titel: string; w: Record<string, string>; type?: string; autoComplete?: string; className?: string;
}) {
  return (
    <label className={`${label} ${className}`}>
      {titel}
      <input name={naam} type={type} defaultValue={w[naam] ?? ""} autoComplete={autoComplete} className={invoer} />
    </label>
  );
}

function AdresBlok({ voorvoegsel, w, land }: { voorvoegsel: string; w: Record<string, string>; land: string }) {
  const n = (s: string) => `${voorvoegsel}${s}`;
  const [postcode, setPostcode] = useState(w[n("postcode")] ?? "");
  const [huisnummer, setHuisnummer] = useState(w[n("huisnummer")] ?? "");
  const [straat, setStraat] = useState(w[n("straat")] ?? "");
  const [plaats, setPlaats] = useState(w[n("plaats")] ?? "");
  const [melding, setMelding] = useState("");

  async function opzoeken() {
    if (land !== "NL" || !postcode || !huisnummer) return;
    setMelding("Adres opzoeken…");
    const gevonden = await zoekAdres(postcode, huisnummer);
    if (gevonden) {
      setStraat(gevonden.straat);
      setPlaats(gevonden.plaats);
      setMelding("Straat en plaats ingevuld. Pas ze aan als ze niet kloppen.");
    } else {
      setMelding("Adres niet gevonden. Vul straat en plaats zelf in.");
    }
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-6">
      <label className={`${label} sm:col-span-2`}>Postcode
        <input name={n("postcode")} value={postcode} onChange={(e) => setPostcode(e.target.value)} onBlur={opzoeken} autoComplete="postal-code" placeholder="7551 AB" className={invoer} />
      </label>
      <label className={`${label} sm:col-span-2`}>Huisnummer
        <input name={n("huisnummer")} value={huisnummer} onChange={(e) => setHuisnummer(e.target.value)} onBlur={opzoeken} placeholder="12a" className={invoer} />
      </label>
      <div className="text-sm text-stone-500 sm:col-span-2 sm:self-end sm:pb-2" aria-live="polite">{melding}</div>
      <label className={`${label} sm:col-span-4`}>Straat
        <input name={n("straat")} value={straat} onChange={(e) => setStraat(e.target.value)} autoComplete="address-line1" className={invoer} />
      </label>
      <label className={`${label} sm:col-span-2`}>Plaats
        <input name={n("plaats")} value={plaats} onChange={(e) => setPlaats(e.target.value)} autoComplete="address-level2" className={invoer} />
      </label>
    </div>
  );
}

export default function Klantformulier({ actie: opslaan, begin = {}, knop = "Klant opslaan", id }: {
  actie: (vorige: FormStatus, formData: FormData) => Promise<FormStatus>;
  begin?: Record<string, string>;
  knop?: string;
  id?: string;
}) {
  const [status, actie, bezig] = useActionState<FormStatus, FormData>(opslaan, { waarden: begin });
  const w = status.waarden;
  const [type, setType] = useState(w.type || "particulier");
  const [land, setLand] = useState(w.land || "NL");
  const [factuurAnders, setFactuurAnders] = useState(w.factuur_anders === "on");
  const bedrijf = isBedrijf(type);

  return (
    <form action={actie} className="mt-6 flex flex-col gap-5">
      {id && <input type="hidden" name="id" value={id} />}
      <section className={sectie}>
        <h2 className={kop}>Soort klant</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className={label}>Soort klant
            <select name="type" value={type} onChange={(e) => setType(e.target.value)} className={invoer}>
              {KLANTTYPES.map((t) => <option key={t.waarde} value={t.waarde}>{t.label}</option>)}
            </select>
          </label>
          <label className={label}>Herkomst
            <select name="herkomst" defaultValue={w.herkomst ?? ""} className={invoer}>
              <option value="">Onbekend</option>
              {["Website-configurator", "Offerteaanvraag", "Telefoon", "Showroom", "Doorverwijzing", "Campagne"].map((h) => <option key={h}>{h}</option>)}
            </select>
          </label>
        </div>
      </section>

      {bedrijf && (
        <section className={sectie}>
          <h2 className={kop}>Bedrijf</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Veld naam="bedrijfsnaam" titel="Bedrijfsnaam" w={w} className="sm:col-span-2" />
            <Veld naam="kvk" titel="KvK-nummer" w={w} />
            <Veld naam="btw_nummer" titel="Btw-nummer" w={w} />
            <Veld naam="website" titel="Website" w={w} type="url" className="sm:col-span-2" />
          </div>
        </section>
      )}

      <section className={sectie}>
        <h2 className={kop}>{bedrijf ? "Contactpersoon" : "Persoon"}</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-6">
          <label className={`${label} sm:col-span-2`}>Aanhef
            <select name="aanhef" defaultValue={w.aanhef ?? ""} className={invoer}>
              <option value="">—</option>
              <option value="dhr">Dhr.</option>
              <option value="mevr">Mevr.</option>
              <option value="geen">Geen aanhef</option>
            </select>
          </label>
          <Veld naam="voornaam" titel="Voornaam" w={w} autoComplete="given-name" className="sm:col-span-4" />
          <Veld naam="tussenvoegsel" titel="Tussenvoegsel" w={w} className="sm:col-span-2" />
          <Veld naam="achternaam" titel="Achternaam" w={w} autoComplete="family-name" className="sm:col-span-4" />
        </div>
      </section>

      <section className={sectie}>
        <h2 className={kop}>Contact</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Veld naam="email" titel="E-mailadres" w={w} type="email" autoComplete="email" />
          <Veld naam="factuur_email" titel="E-mailadres facturen (indien anders)" w={w} type="email" />
          <Veld naam="telefoon" titel="Telefoon" w={w} type="tel" autoComplete="tel" />
          <Veld naam="mobiel" titel="Mobiel" w={w} type="tel" />
        </div>
      </section>

      <section className={sectie}>
        <h2 className={kop}>{bedrijf ? "Projectadres" : "Adres"}</h2>
        <div className="mb-4 max-w-xs">
          <label className={label}>Land
            <select name="land" value={land} onChange={(e) => setLand(e.target.value)} className={invoer}>
              <option value="NL">Nederland</option>
              <option value="BE">België</option>
              <option value="DE">Duitsland</option>
            </select>
          </label>
        </div>
        <AdresBlok voorvoegsel="" w={w} land={land} />
        <div className="mt-5 grid grid-cols-1 gap-4 border-t border-stone-200 pt-5 sm:grid-cols-6">
          <label className={`${label} sm:col-span-3`}>Type woning
            <select name="woningtype" defaultValue={w.woningtype ?? ""} className={invoer}>
              <option value="">Onbekend</option>
              {["Tussenwoning", "Hoekwoning", "Twee-onder-een-kap", "Vrijstaand", "Appartement", "Utiliteit", "Overig"].map((t) => <option key={t}>{t}</option>)}
            </select>
          </label>
          <Veld naam="bouwjaar" titel="Bouwjaar" w={w} type="number" className="sm:col-span-3" />
          <label className={`${label} sm:col-span-3`}>Bereikbaarheid
            <select name="bereikbaarheid" defaultValue={w.bereikbaarheid ?? ""} className={invoer}>
              <option value="">Onbekend</option>
              <option>Goed bereikbaar</option>
              <option>Steiger nodig</option>
              <option>Hoogwerker nodig</option>
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm font-medium sm:col-span-3 sm:self-end sm:pb-2">
            <input type="checkbox" name="monument" defaultChecked={w.monument === "on"} className="h-4 w-4" />
            Monument of beschermd stadsgezicht
          </label>
        </div>
      </section>

      <section className={sectie}>
        <label className="flex items-center gap-2 text-sm font-medium">
          <input type="checkbox" name="factuur_anders" checked={factuurAnders} onChange={(e) => setFactuurAnders(e.target.checked)} className="h-4 w-4" />
          Het factuuradres is anders dan het {bedrijf ? "projectadres" : "adres"}
        </label>
        {factuurAnders && (
          <div className="mt-4">
            <h2 className={kop}>Factuuradres</h2>
            <AdresBlok voorvoegsel="f_" w={w} land={land} />
          </div>
        )}
      </section>

      <section className={sectie}>
        <h2 className={kop}>Overig</h2>
        <label className={label}>Notitie
          <textarea name="notitie" rows={3} defaultValue={w.notitie ?? ""} className={invoer} />
        </label>
        <label className="mt-4 flex items-center gap-2 text-sm font-medium">
          <input type="checkbox" name="marketing_toestemming" defaultChecked={w.marketing_toestemming === "on"} className="h-4 w-4" />
          Akkoord met het ontvangen van nieuws en aanbiedingen
        </label>
      </section>

      {status.fout && <p role="alert" className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-800">{status.fout}</p>}
      <div className="flex gap-3">
        <button disabled={bezig} className="rounded-md bg-[#B35B40] px-5 py-2.5 font-semibold text-white hover:brightness-110 disabled:opacity-60">
          {bezig ? "Opslaan…" : knop}
        </button>
      </div>
    </form>
  );
}
