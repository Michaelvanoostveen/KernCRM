export type BezorgSoort = "verzonden" | "bezorgd" | "vertraagd" | "teruggekaatst" | "klacht" | "mislukt" | "geblokkeerd";
export type BezorgEvent = { soort: BezorgSoort; detail: string | null; opgetreden: string };

/** Hoe zwaar een gebeurtenis weegt: een teruggekaatste mail blijft teruggekaatst, ook al kwam er eerder een melding "onderweg" of "vertraagd". */
const RANG: Record<BezorgSoort, number> = { verzonden: 1, vertraagd: 2, bezorgd: 3, klacht: 4, geblokkeerd: 5, mislukt: 6, teruggekaatst: 7 };

/** De bezorgstatus van één mail: de zwaarste gebeurtenis die Resend heeft gemeld; zonder melding is de mail verzonden en wacht het CRM op bericht. */
export function besteGebeurtenis(events: BezorgEvent[]): BezorgEvent | null {
  let beste: BezorgEvent | null = null;
  for (const e of events) {
    if (!beste || RANG[e.soort] > RANG[beste.soort] || (RANG[e.soort] === RANG[beste.soort] && e.opgetreden > beste.opgetreden)) beste = e;
  }
  return beste;
}

export const IS_PROBLEEM = (s: BezorgSoort | null | undefined): boolean => s === "teruggekaatst" || s === "mislukt" || s === "geblokkeerd" || s === "klacht";

export const BEZORG_LABEL: Record<BezorgSoort | "onderweg", { label: string; kleur: string }> = {
  onderweg: { label: "Onderweg", kleur: "bg-stone-100 text-stone-700" },
  verzonden: { label: "Verzonden", kleur: "bg-stone-100 text-stone-700" },
  bezorgd: { label: "Bezorgd", kleur: "bg-green-100 text-green-800" },
  vertraagd: { label: "Vertraagd", kleur: "bg-amber-100 text-amber-900" },
  teruggekaatst: { label: "Teruggekaatst", kleur: "bg-red-100 text-red-800" },
  klacht: { label: "Als spam gemeld", kleur: "bg-red-100 text-red-800" },
  mislukt: { label: "Niet bezorgd", kleur: "bg-red-100 text-red-800" },
  geblokkeerd: { label: "Adres geblokkeerd", kleur: "bg-red-100 text-red-800" },
};

/** Uitleg bij een probleem, in gewone taal, met wat je eraan kunt doen. */
export function probleemUitleg(s: BezorgSoort): string {
  switch (s) {
    case "teruggekaatst": return "De mail is teruggekaatst: het adres bestaat niet (meer) of de mailbox is vol of geweigerd. Controleer het e-mailadres bij de klantgegevens en stuur de mail opnieuw, of bel de klant.";
    case "klacht": return "De ontvanger heeft de mail als spam gemarkeerd. Stuur geen herinneringen meer per mail naar dit adres en neem telefonisch contact op.";
    case "geblokkeerd": return "Dit adres staat op de blokkadelijst van de mailserver (eerder teruggekaatst of als spam gemeld). Neem contact op met de klant en controleer het adres.";
    case "mislukt": return "De mail is niet bezorgd. Probeer het opnieuw of neem contact op met de klant.";
    default: return "";
  }
}
