"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/", label: "Start" },
  { href: "/klanten", label: "Klanten" },
  { href: "/projecten", label: "Projecten" },
  { href: "/instellingen/catalogus", label: "Catalogus" },
  { href: "/instellingen/gebruikers", label: "Gebruikers" },
];

export default function Navigatie() {
  const pad = usePathname();
  return (
    <nav aria-label="Hoofdmenu" className="flex gap-1">
      {ITEMS.map((i) => {
        const actief = pad === i.href || pad.startsWith(`${i.href}/`);
        return (
          <Link key={i.href} href={i.href} aria-current={actief ? "page" : undefined} className={`rounded-md px-3 py-1.5 text-sm font-medium ${actief ? "bg-white/15 text-white" : "text-white/75 hover:bg-white/10 hover:text-white"}`}>
            {i.label}
          </Link>
        );
      })}
    </nav>
  );
}
