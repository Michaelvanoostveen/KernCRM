import { menuGroepen } from "@/lib/menu";
import { haalRol } from "./start-gegevens";
import Navigatie from "./navigatie";

/** Het menu hangt af van de rol (zie lib/menu.ts). */
export default async function Menu({ uitloggen }: { uitloggen: React.ReactNode }) {
  return <Navigatie groepen={menuGroepen(await haalRol())} uitloggen={uitloggen} />;
}
