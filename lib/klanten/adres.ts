import { normaliseerPostcode, splitsHuisnummer } from "./klant";

/** Zoekt straat en plaats bij een Nederlandse postcode en huisnummer via de gratis PDOK Locatieserver. */
export async function zoekAdres(postcode: string, huisnummerInvoer: string): Promise<{ straat: string; plaats: string } | null> {
  const pc = normaliseerPostcode(postcode);
  const { huisnummer } = splitsHuisnummer(huisnummerInvoer);
  if (!pc || !/^\d+$/.test(huisnummer)) return null;

  const params = new URLSearchParams({
    q: `postcode:${pc.replace(" ", "")} AND huisnummer:${huisnummer}`,
    fq: "type:adres",
    rows: "1",
    fl: "straatnaam,woonplaatsnaam",
  });
  try {
    const res = await fetch(`https://api.pdok.nl/bzk/locatieserver/search/v3_1/free?${params}`);
    if (!res.ok) return null;
    const doc = (await res.json())?.response?.docs?.[0];
    return doc?.straatnaam && doc?.woonplaatsnaam ? { straat: doc.straatnaam, plaats: doc.woonplaatsnaam } : null;
  } catch {
    return null;
  }
}
