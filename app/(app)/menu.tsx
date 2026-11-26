import { menuGroepen } from "@/lib/menu";
import { maakServerClient } from "@/lib/supabase/server";
import { haalRol } from "./start-gegevens";
import Navigatie from "./navigatie";

/** Het menu hangt af van de rol (zie lib/menu.ts). Bij Meldingen staat het aantal ongelezen meldingen. */
export default async function Menu({ uitloggen }: { uitloggen: React.ReactNode }) {
  const groepen = menuGroepen(await haalRol());
  if (groepen.some((g) => g.items.some((i) => i.href === "/meldingen"))) {
    const supabase = await maakServerClient();
    const { count } = await supabase.from("meldingen").select("id", { count: "exact", head: true }).is("gelezen_op", null);
    for (const g of groepen) for (const i of g.items) if (i.href === "/meldingen") i.badge = count ?? 0;
  }
  return <Navigatie groepen={groepen} uitloggen={uitloggen} />;
}
