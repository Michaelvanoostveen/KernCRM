"use server";

import { redirect } from "next/navigation";
import { maakServerClient } from "@/lib/supabase/server";
import { KLANTTYPES, isBedrijf, normaliseerPostcode, splitsHuisnummer, weergavenaam } from "@/lib/klanten/klant";

export type FormStatus = { fout?: string; waarden: Record<string, string> };

const tekst = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const leeg = (v: string) => (v === "" ? null : v);

export async function bewaarKlant(_vorige: FormStatus, formData: FormData): Promise<FormStatus> {
  const waarden: Record<string, string> = {};
  formData.forEach((v, k) => {
    if (typeof v === "string") waarden[k] = v;
  });
  const fout = (bericht: string): FormStatus => ({ fout: bericht, waarden });

  const type = tekst(formData, "type");
  if (!KLANTTYPES.some((t) => t.waarde === type)) return fout("Kies een geldige soort klant.");

  const naam = weergavenaam({
    type,
    bedrijfsnaam: tekst(formData, "bedrijfsnaam"),
    voornaam: tekst(formData, "voornaam"),
    tussenvoegsel: tekst(formData, "tussenvoegsel"),
    achternaam: tekst(formData, "achternaam"),
  });
  if (!naam) return fout(isBedrijf(type) ? "Vul een bedrijfsnaam of een contactpersoon in." : "Vul minimaal een achternaam in.");

  const email = tekst(formData, "email");
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fout("Het e-mailadres lijkt niet te kloppen.");

  // Adres: alleen opslaan als er iets is ingevuld; dan moet het compleet zijn.
  const land = tekst(formData, "land") || "NL";
  const adres = {
    postcode: tekst(formData, "postcode"),
    huisnummer: tekst(formData, "huisnummer"),
    toevoeging: tekst(formData, "toevoeging"),
    straat: tekst(formData, "straat"),
    plaats: tekst(formData, "plaats"),
  };
  const adresIngevuld = Object.values(adres).some(Boolean);
  let postcode = adres.postcode;
  if (adresIngevuld) {
    if (!adres.postcode || !adres.huisnummer || !adres.straat || !adres.plaats) {
      return fout("Vul het adres compleet in (postcode, huisnummer, straat en plaats) of laat het helemaal leeg.");
    }
    if (land === "NL") {
      const p = normaliseerPostcode(adres.postcode);
      if (!p) return fout("De postcode lijkt niet te kloppen. Gebruik bijvoorbeeld 7551 AB.");
      postcode = p;
    }
  }

  const supabase = await maakServerClient();
  const { data: lid } = await supabase.from("tenant_leden").select("tenant_id").limit(1).maybeSingle();
  if (!lid) return fout("Je account hoort nog bij geen bedrijf. Vraag de beheerder om je toe te voegen.");

  const { data: klant, error } = await supabase
    .from("klanten")
    .insert({
      tenant_id: lid.tenant_id,
      type,
      naam,
      aanhef: leeg(tekst(formData, "aanhef")),
      voornaam: leeg(tekst(formData, "voornaam")),
      tussenvoegsel: leeg(tekst(formData, "tussenvoegsel")),
      achternaam: leeg(tekst(formData, "achternaam")),
      bedrijfsnaam: isBedrijf(type) ? leeg(tekst(formData, "bedrijfsnaam")) : null,
      kvk: isBedrijf(type) ? leeg(tekst(formData, "kvk")) : null,
      btw_nummer: isBedrijf(type) ? leeg(tekst(formData, "btw_nummer")) : null,
      website: leeg(tekst(formData, "website")),
      email: leeg(email),
      factuur_email: leeg(tekst(formData, "factuur_email")),
      telefoon: leeg(tekst(formData, "telefoon")),
      mobiel: leeg(tekst(formData, "mobiel")),
      herkomst: leeg(tekst(formData, "herkomst")),
      notitie: leeg(tekst(formData, "notitie")),
      marketing_toestemming: formData.get("marketing_toestemming") === "on",
    })
    .select("id")
    .single();
  if (error || !klant) return fout("Opslaan lukte niet. Controleer de gegevens en probeer het opnieuw.");

  if (adresIngevuld) {
    const { huisnummer, toevoeging: toev } = splitsHuisnummer(adres.huisnummer);
    const bouwjaar = Number(tekst(formData, "bouwjaar")) || null;
    const rij = (soort: "project" | "factuur", extra: Record<string, unknown>) => ({
      tenant_id: lid.tenant_id,
      klant_id: klant.id,
      soort,
      straat: adres.straat,
      huisnummer,
      toevoeging: leeg(adres.toevoeging || toev),
      postcode,
      plaats: adres.plaats,
      land,
      ...extra,
    });
    const rijen = [
      rij("project", {
        bouwjaar,
        woningtype: leeg(tekst(formData, "woningtype")),
        bereikbaarheid: leeg(tekst(formData, "bereikbaarheid")),
        monument: formData.get("monument") === "on",
      }),
    ];
    if (formData.get("factuur_anders") !== "on") {
      // Geen apart factuuradres: het projectadres geldt ook als factuuradres.
      rijen.push(rij("factuur", {}));
    } else {
      const fHuis = splitsHuisnummer(tekst(formData, "f_huisnummer"));
      const fPostcode = normaliseerPostcode(tekst(formData, "f_postcode")) ?? tekst(formData, "f_postcode");
      if (!fPostcode || !fHuis.huisnummer || !tekst(formData, "f_straat") || !tekst(formData, "f_plaats")) {
        await supabase.from("klanten").delete().eq("id", klant.id);
        return fout("Vul het factuuradres compleet in of haal het vinkje weg.");
      }
      rijen.push({
        tenant_id: lid.tenant_id,
        klant_id: klant.id,
        soort: "factuur",
        straat: tekst(formData, "f_straat"),
        huisnummer: fHuis.huisnummer,
        toevoeging: leeg(fHuis.toevoeging),
        postcode: fPostcode,
        plaats: tekst(formData, "f_plaats"),
        land,
      });
    }
    const { error: adresFout } = await supabase.from("adressen").insert(rijen);
    if (adresFout) {
      await supabase.from("klanten").delete().eq("id", klant.id);
      return fout("Het adres kon niet worden opgeslagen. De klant is niet bewaard; probeer het opnieuw.");
    }
  }

  redirect("/klanten");
}
