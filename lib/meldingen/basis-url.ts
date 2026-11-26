/**
 * De vaste basis van het adres van het CRM, voor links in meldingsmails. Bewust niet uit de headers van het verzoek: die komen hier van een anonieme bezoeker
 * en zouden een link naar een andere site in een mail aan de medewerkers kunnen zetten. Eerst CRM_BASIS_URL, anders het productieadres dat Vercel zelf instelt.
 */
export function basisUrl(): string | null {
  const vast = process.env.CRM_BASIS_URL?.trim().replace(/\/+$/, "");
  if (vast && /^https:\/\/[a-z0-9.-]+(:\d+)?$/i.test(vast)) return vast;
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  return vercel && /^[a-z0-9.-]+$/i.test(vercel) ? `https://${vercel}` : null;
}
