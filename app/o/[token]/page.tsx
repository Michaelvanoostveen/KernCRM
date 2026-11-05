import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { maakAnoniemeClient } from "@/lib/supabase/anoniem";
import { maakServerClient } from "@/lib/supabase/server";
import { eersteIp } from "@/lib/offerte/handtekening";
import { leesPubliekeOfferte } from "@/lib/offerte/publiek";
import { isGeldigeToken } from "@/lib/offerte/token";
import OfferteWeergave from "./weergave";

async function Inhoud({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!isGeldigeToken(token)) notFound();

  const supabase = maakAnoniemeClient();
  const { data } = await supabase.rpc("offerte_publiek", { p_token: token });
  const o = leesPubliekeOfferte(data);
  if (!o) notFound();

  // Een medewerker die de link opent om te kijken telt niet mee als "geopend door de klant".
  const { data: { user } } = await (await maakServerClient()).auth.getUser();
  if (!user) {
    const h = await headers();
    await supabase.rpc("offerte_geopend", { p_token: token, p_ip: eersteIp(h.get("x-forwarded-for")), p_user_agent: h.get("user-agent") });
  }

  // Het tijdstip bepalen we hier, nadat de gegevens zijn opgehaald, zodat het per bezoek wordt berekend.
  const verlopen = o.status === "verstuurd" && o.geldig_tot !== null && new Date(o.geldig_tot + "T23:59:59") < new Date();
  return <OfferteWeergave o={o} token={token} verlopen={verlopen} />;
}

export const metadata = { title: "Uw offerte", robots: { index: false, follow: false } };

export default function OffertePagina(props: { params: Promise<{ token: string }> }) {
  return (
    <Suspense fallback={<p className="p-8 text-stone-500">Offerte laden…</p>}>
      <Inhoud params={props.params} />
    </Suspense>
  );
}
