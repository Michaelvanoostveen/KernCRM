"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { maakAnoniemeClient } from "@/lib/supabase/anoniem";
import { INSTELLINGEN_KERNKOZIJNEN } from "@/lib/offerte/instellingen";
import { eersteIp, isGeldigeHandtekening } from "@/lib/offerte/handtekening";
import { berekenPubliek, leesPubliekeOfferte } from "@/lib/offerte/publiek";
import { isGeldigeToken } from "@/lib/offerte/token";

export type AkkoordStatus = { fout?: string };

const FOUTEN: Record<string, string> = {
  onbekend: "Deze offerte kan niet meer worden getekend. Misschien is hij al getekend of ingetrokken. Neem contact met ons op.",
  verlopen: "Deze offerte is verlopen. Neem contact met ons op voor een nieuwe offerte.",
  naam: "Vul uw volledige naam in.",
  handtekening: "Zet uw handtekening in het vak en probeer het opnieuw.",
};

export async function geefAkkoord(_vorige: AkkoordStatus, formData: FormData): Promise<AkkoordStatus> {
  const token = formData.get("token");
  if (!isGeldigeToken(token)) return { fout: FOUTEN.onbekend };
  const naam = String(formData.get("naam") ?? "").trim();
  if (naam.length < 3 || naam.length > 120) return { fout: FOUTEN.naam };
  const handtekening = formData.get("handtekening");
  if (!isGeldigeHandtekening(handtekening)) return { fout: FOUTEN.handtekening };
  if (formData.get("akkoord") !== "on") return { fout: "Vink aan dat u akkoord gaat met de offerte en de voorwaarden." };

  const supabase = maakAnoniemeClient();
  const { data: gegevens } = await supabase.rpc("offerte_publiek", { p_token: token });
  const offerte = leesPubliekeOfferte(gegevens);
  if (!offerte || offerte.status !== "verstuurd") return { fout: FOUTEN.onbekend };

  const h = await headers();
  const { data, error } = await supabase.rpc("offerte_akkoord", {
    p_token: token,
    p_naam: naam,
    p_handtekening: handtekening,
    p_ip: eersteIp(h.get("x-forwarded-for")) ?? eersteIp(h.get("x-real-ip")),
    p_user_agent: h.get("user-agent"),
    p_totaal: berekenPubliek(offerte, INSTELLINGEN_KERNKOZIJNEN).totaal,
  });
  if (error) {
    console.error("akkoord mislukt:", error.code, error.message);
    return { fout: "Het akkoord kon niet worden opgeslagen. Probeer het opnieuw of neem contact met ons op." };
  }
  const uitkomst = data as { ok?: boolean; fout?: string } | null;
  if (!uitkomst?.ok) return { fout: FOUTEN[uitkomst?.fout ?? ""] ?? FOUTEN.onbekend };
  redirect(`/o/${token}`);
}
