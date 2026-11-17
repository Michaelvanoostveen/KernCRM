import { afzenderKop, isMailAdres, schoneKop } from "./adres";

export interface MailBijlage { bestandsnaam: string; inhoud: Uint8Array }

export interface MailBericht {
  vanNaam: string;
  vanAdres: string;
  aan: string;
  antwoordAan?: string | null;
  onderwerp: string;
  tekst: string;
  bijlagen?: MailBijlage[];
  /** Zelfde sleutel binnen 24 uur geeft nooit een tweede mail (tegen dubbele klikken). */
  sleutel: string;
}

/**
 * De aansluiting met een mailbezorgdienst (nu Resend). Het CRM praat alleen met dit contract en nooit rechtstreeks met een dienst;
 * wisselen van dienst raakt dus alleen één bestand.
 */
export interface MailProvider {
  naam: string;
  verstuur(bericht: MailBericht): Promise<{ externId: string }>;
}

export class MailFout extends Error {
  constructor(message: string, public readonly code: "geen_sleutel" | "ongeldig" | "geweigerd" | "netwerk" | "dienst") {
    super(message);
  }
}

const MAX_BIJLAGEN_BYTES = 10 * 1024 * 1024;

const naarBase64 = (b: Uint8Array) => Buffer.from(b).toString("base64");

/** Verzendt via de API van Resend. De sleutel komt uit de omgeving van de server (RESEND_API_KEY) en wordt hier alleen doorgegeven. */
export class ResendMailProvider implements MailProvider {
  readonly naam = "Resend";
  constructor(private readonly sleutel: string, private readonly haal: typeof fetch = fetch) {}

  async verstuur(b: MailBericht): Promise<{ externId: string }> {
    if (!this.sleutel) throw new MailFout("De mailsleutel ontbreekt op de server.", "geen_sleutel");
    if (!isMailAdres(b.aan) || !isMailAdres(b.vanAdres) || (b.antwoordAan && !isMailAdres(b.antwoordAan))) throw new MailFout("Een e-mailadres is ongeldig.", "ongeldig");
    const bijlagen = b.bijlagen ?? [];
    if (bijlagen.reduce((s, x) => s + x.inhoud.byteLength, 0) > MAX_BIJLAGEN_BYTES) throw new MailFout("De bijlagen zijn te groot (hooguit 10 MB).", "ongeldig");

    const lichaam = {
      from: afzenderKop(b.vanNaam, b.vanAdres),
      to: [b.aan.trim()],
      ...(b.antwoordAan ? { reply_to: b.antwoordAan.trim() } : {}),
      subject: schoneKop(b.onderwerp),
      text: b.tekst,
      ...(bijlagen.length ? { attachments: bijlagen.map((x) => ({ filename: x.bestandsnaam, content: naarBase64(x.inhoud) })) } : {}),
    };
    const afbreker = new AbortController();
    const timer = setTimeout(() => afbreker.abort(), 20_000);
    let antwoord: Response;
    try {
      antwoord = await this.haal("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${this.sleutel}`, "Content-Type": "application/json", "Idempotency-Key": b.sleutel.slice(0, 250) },
        body: JSON.stringify(lichaam),
        signal: afbreker.signal,
      });
    } catch {
      throw new MailFout("De mailserver was niet bereikbaar.", "netwerk");
    } finally {
      clearTimeout(timer);
    }
    const data = (await antwoord.json().catch(() => null)) as { id?: string; message?: string; name?: string } | null;
    if (!antwoord.ok) {
      const code = antwoord.status === 401 || antwoord.status === 403 ? "geweigerd" : antwoord.status === 422 || antwoord.status === 400 ? "ongeldig" : "dienst";
      throw new MailFout(`Resend: ${data?.message ?? `fout ${antwoord.status}`}`.slice(0, 300), code);
    }
    if (!data?.id) throw new MailFout("Resend gaf geen verwijzing terug.", "dienst");
    return { externId: data.id };
  }
}

/** Kiest de aansluiting voor een bedrijf; null als er niet verbonden kan worden (geen aansluiting gekozen of geen sleutel). */
export function maakMailProvider(provider: string, sleutel: string | undefined): MailProvider | null {
  if (provider === "resend" && sleutel) return new ResendMailProvider(sleutel);
  return null;
}
