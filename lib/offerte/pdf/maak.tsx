import { renderToBuffer } from "@react-pdf/renderer";
import type { PubliekeOfferte } from "../publiek";
import { OfferteDocument } from "./document";

/** Maakt de offerte als PDF-bestand. */
export async function maakOffertePdf(o: PubliekeOfferte): Promise<Buffer> {
  return renderToBuffer(<OfferteDocument o={o} />);
}

export function pdfBestandsnaam(o: Pick<PubliekeOfferte, "nummer" | "versie">): string {
  return `Offerte-${o.nummer}-v${o.versie}.pdf`.replace(/[^A-Za-z0-9._-]/g, "-");
}
