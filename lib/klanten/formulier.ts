import { maakAdresRijen } from "./adresrijen";
import type { AdresDelen, WoningDelen } from "./adresrijen";
import { KLANTTYPES, isBedrijf, normaliseerPostcode, splitsHuisnummer, weergavenaam } from "./klant";

export type KlantVelden = {
  type: string;
  naam: string;
  aanhef: string | null;
  voornaam: string | null;
  tussenvoegsel: string | null;
  achternaam: string | null;
  bedrijfsnaam: string | null;
  kvk: string | null;
  btw_nummer: string | null;
  website: string | null;
  email: string | null;
  factuur_email: string | null;
  telefoon: string | null;
  mobiel: string | null;
  herkomst: string | null;
  notitie: string | null;
  marketing_toestemming: boolean;
};

export type GelezenFormulier =
  | { ok: false; fout: string }
  | { ok: true; klant: KlantVelden; land: string; project: (AdresDelen & WoningDelen) | null; factuur: AdresDelen | null };

const leeg = (v: string) => (v === "" ? null : v);

/** Leest en controleert het klantformulier. Doet geen database-aanroepen. */
export function leesFormulier(formData: FormData): GelezenFormulier {
  const tekst = (k: string) => String(formData.get(k) ?? "").trim();
  const fout = (bericht: string): GelezenFormulier => ({ ok: false, fout: bericht });

  const type = tekst("type");
  if (!KLANTTYPES.some((t) => t.waarde === type)) return fout("Kies een geldige soort klant.");

  const naam = weergavenaam({
    type,
    bedrijfsnaam: tekst("bedrijfsnaam"),
    voornaam: tekst("voornaam"),
    tussenvoegsel: tekst("tussenvoegsel"),
    achternaam: tekst("achternaam"),
  });
  if (!naam) return fout(isBedrijf(type) ? "Vul een bedrijfsnaam of een contactpersoon in." : "Vul minimaal een achternaam in.");

  const mailOk = (m: string) => !m || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(m);
  if (!mailOk(tekst("email")) || !mailOk(tekst("factuur_email"))) return fout("Een e-mailadres lijkt niet te kloppen.");

  const land = tekst("land") || "NL";
  const postcodeVan = (invoer: string) => (land === "NL" ? normaliseerPostcode(invoer) : invoer);

  let project: (AdresDelen & WoningDelen) | null = null;
  let factuur: AdresDelen | null = null;
  const velden = ["postcode", "huisnummer", "straat", "plaats"].map(tekst);
  if (velden.some(Boolean)) {
    if (!velden.every(Boolean)) return fout("Vul het adres compleet in (postcode, huisnummer, straat en plaats) of laat het helemaal leeg.");
    const postcode = postcodeVan(tekst("postcode"));
    if (!postcode) return fout("De postcode lijkt niet te kloppen. Gebruik bijvoorbeeld 7551 AB.");
    const nr = splitsHuisnummer(tekst("huisnummer"));
    project = {
      straat: tekst("straat"),
      huisnummer: nr.huisnummer,
      toevoeging: leeg(tekst("toevoeging") || nr.toevoeging),
      postcode,
      plaats: tekst("plaats"),
      bouwjaar: Number(tekst("bouwjaar")) || null,
      woningtype: leeg(tekst("woningtype")),
      bereikbaarheid: leeg(tekst("bereikbaarheid")),
      monument: formData.get("monument") === "on",
    };
    if (formData.get("factuur_anders") === "on") {
      const f = splitsHuisnummer(tekst("f_huisnummer"));
      const fPostcode = postcodeVan(tekst("f_postcode"));
      if (!fPostcode || !f.huisnummer || !tekst("f_straat") || !tekst("f_plaats")) {
        return fout("Vul het factuuradres compleet in (met een geldige postcode) of haal het vinkje weg.");
      }
      factuur = { straat: tekst("f_straat"), huisnummer: f.huisnummer, toevoeging: leeg(f.toevoeging), postcode: fPostcode, plaats: tekst("f_plaats") };
    }
  }

  const bedrijf = isBedrijf(type);
  return {
    ok: true,
    land,
    project,
    factuur,
    klant: {
      type,
      naam,
      aanhef: leeg(tekst("aanhef")),
      voornaam: leeg(tekst("voornaam")),
      tussenvoegsel: leeg(tekst("tussenvoegsel")),
      achternaam: leeg(tekst("achternaam")),
      bedrijfsnaam: bedrijf ? leeg(tekst("bedrijfsnaam")) : null,
      kvk: bedrijf ? leeg(tekst("kvk")) : null,
      btw_nummer: bedrijf ? leeg(tekst("btw_nummer")) : null,
      website: leeg(tekst("website")),
      email: leeg(tekst("email")),
      factuur_email: leeg(tekst("factuur_email")),
      telefoon: leeg(tekst("telefoon")),
      mobiel: leeg(tekst("mobiel")),
      herkomst: leeg(tekst("herkomst")),
      notitie: leeg(tekst("notitie")),
      marketing_toestemming: formData.get("marketing_toestemming") === "on",
    },
  };
}

export { maakAdresRijen };

type OpgeslagenAdres = AdresDelen & Partial<WoningDelen> & { soort: string; land?: string | null };
type OpgeslagenKlant = Record<string, unknown> & { adressen: OpgeslagenAdres[] };

/** Zet een opgeslagen klant om naar de veldwaarden van het formulier, voor het bewerken. */
export function klantNaarFormulier(k: OpgeslagenKlant): Record<string, string> {
  const w: Record<string, string> = {};
  const zet = (naam: string, waarde: unknown) => {
    if (waarde !== null && waarde !== undefined && waarde !== "") w[naam] = String(waarde);
  };
  for (const v of ["type", "aanhef", "voornaam", "tussenvoegsel", "achternaam", "bedrijfsnaam", "kvk", "btw_nummer", "website", "email", "factuur_email", "telefoon", "mobiel", "herkomst", "notitie"]) zet(v, k[v]);
  if (k.marketing_toestemming) w.marketing_toestemming = "on";

  const nummer = (a: AdresDelen) => `${a.huisnummer}${a.toevoeging ?? ""}`;
  const project = k.adressen.find((a) => a.soort === "project") ?? k.adressen[0];
  const factuur = k.adressen.find((a) => a.soort === "factuur");
  if (project) {
    zet("land", project.land);
    zet("postcode", project.postcode);
    zet("huisnummer", nummer(project));
    zet("straat", project.straat);
    zet("plaats", project.plaats);
    zet("woningtype", project.woningtype);
    zet("bouwjaar", project.bouwjaar);
    zet("bereikbaarheid", project.bereikbaarheid);
    if (project.monument) w.monument = "on";
    const verschilt = factuur && [factuur.straat, nummer(factuur), factuur.postcode, factuur.plaats].join("|") !== [project.straat, nummer(project), project.postcode, project.plaats].join("|");
    if (factuur && verschilt) {
      w.factuur_anders = "on";
      zet("f_postcode", factuur.postcode);
      zet("f_huisnummer", nummer(factuur));
      zet("f_straat", factuur.straat);
      zet("f_plaats", factuur.plaats);
    }
  }
  return w;
}
