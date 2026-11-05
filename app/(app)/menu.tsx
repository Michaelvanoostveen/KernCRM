import { haalRol } from "./start-gegevens";
import Navigatie from "./navigatie";

const VOLLEDIG = [
  { href: "/", label: "Start" },
  { href: "/klanten", label: "Klanten" },
  { href: "/projecten", label: "Projecten" },
  { href: "/inmeting", label: "Inmeting" },
  { href: "/instellingen/catalogus", label: "Catalogus" },
  { href: "/instellingen/gebruikers", label: "Gebruikers" },
];
const INMETER = [{ href: "/inmeting", label: "Inmeting" }];

/** Het menu hangt af van de rol: een inmeter ziet alleen zijn eigen inmetingen. */
export default async function Menu() {
  const rol = await haalRol();
  return <Navigatie items={rol === "inmeter" ? INMETER : VOLLEDIG} />;
}
