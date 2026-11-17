import { maakAnoniemeClient } from "@/lib/supabase/anoniem";
import { maakOffertePdf, pdfBestandsnaam } from "./maak";
import { leesPubliekeOfferte } from "../publiek";

/**
 * De PDF van een verstuurde offerte, gemaakt van precies dezelfde gegevens als de klant op de online offerte ziet (dus nooit met aanpassingen of redenen).
 * Eén bron voor de download en de bijlage bij de mail. Null als de offerte niet (meer) bestaat.
 */
export async function laadOffertePdf(publiekToken: string): Promise<{ pdf: Buffer; bestandsnaam: string } | null> {
  const { data } = await maakAnoniemeClient().rpc("offerte_publiek", { p_token: publiekToken });
  const publiek = leesPubliekeOfferte(data);
  if (!publiek) return null;
  return { pdf: await maakOffertePdf(publiek), bestandsnaam: pdfBestandsnaam(publiek) };
}
