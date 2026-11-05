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
const FACTUREN = { href: "/facturen", label: "Facturen" };
const INMETER = [{ href: "/inmeting", label: "Inmeting" }];

/** Het menu hangt af van de rol: een inmeter ziet alleen zijn eigen inmetingen. */
export default async function Menu() {
  const rol = await haalRol();
  if (rol === "inmeter") return <Navigatie items={INMETER} />;
  // Facturen zijn alleen voor directie, kantoor en verkoop.
  const items = rol === "directie" || rol === "kantoor" || rol === "verkoop" ? [...VOLLEDIG.slice(0, 4), FACTUREN, ...VOLLEDIG.slice(4)] : VOLLEDIG;
  return <Navigatie items={items} />;
}
