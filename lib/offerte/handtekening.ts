const PREFIX = "data:image/png;base64,";

/** Controleert dat een handtekening een PNG-afbeelding is van een redelijke grootte. */
export function isGeldigeHandtekening(waarde: unknown): waarde is string {
  if (typeof waarde !== "string" || !waarde.startsWith(PREFIX)) return false;
  const data = waarde.slice(PREFIX.length);
  return data.length >= 200 && data.length <= 390_000 && /^[A-Za-z0-9+/=]+$/.test(data);
}

/** Eerste (originele) IP-adres uit de header x-forwarded-for. */
export function eersteIp(header: string | null | undefined): string | null {
  const eerste = header?.split(",")[0]?.trim();
  return eerste ? eerste.slice(0, 80) : null;
}

/** Datum over een aantal dagen als jjjj-mm-dd, voor de geldigheid van een offerte. */
export function datumOver(dagen: number, vanaf = new Date()): string {
  const d = new Date(vanaf.getTime() + dagen * 86_400_000);
  return d.toISOString().slice(0, 10);
}
