"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import type { MenuGroep, MenuItem } from "@/lib/menu";
export type { MenuItem };

const LINK = "block rounded-md px-3 py-2 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white";

/**
 * Het hoofdmenu als zijbalk links (vanaf een breed scherm), in groepen; op een telefoon of smal scherm een balk bovenaan met een menuknop. Wie maar één of twee
 * onderdelen heeft (een monteur of inmeter), ziet die direct in de balk zonder menuknop.
 */
export default function Navigatie({ groepen, uitloggen }: { groepen: MenuGroep[]; uitloggen: React.ReactNode }) {
  const pad = usePathname();
  const [open, setOpen] = useState(false);
  const alle = groepen.flatMap((g) => g.items);
  const kort = alle.length <= 2;
  const actief = (i: MenuItem) => pad === i.href || pad.startsWith(`${i.href}/`);
  const stijl = (i: MenuItem) => `${LINK} ${actief(i) ? "bg-white/15 text-white" : "text-white/75 hover:bg-white/10 hover:text-white"}`;

  const lijst = (
    <nav aria-label="Hoofdmenu" className="grid gap-5">
      {groepen.map((g, n) => (
        <div key={g.titel ?? `groep-${n}`}>
          {g.titel && <div className="px-3 pb-1 text-xs font-semibold uppercase tracking-wider text-white/45">{g.titel}</div>}
          <ul className="grid gap-0.5">
            {g.items.map((i) => (
              <li key={i.href}><Link href={i.href} onClick={() => setOpen(false)} aria-current={actief(i) ? "page" : undefined} className={stijl(i)}>{i.label}</Link></li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );

  return (
    <aside className="bg-[#24332B] text-white print:hidden lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-60 lg:shrink-0 lg:flex-col lg:overflow-y-auto">
      <div className="flex items-center gap-3 px-4 py-3 lg:px-5 lg:py-5">
        <Link href="/" className="rounded-md text-lg font-bold tracking-tight hover:text-white/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">KernCRM</Link>
        {kort && (
          <nav aria-label="Hoofdmenu" className="ml-2 flex gap-1 lg:hidden">
            {alle.map((i) => <Link key={i.href} href={i.href} aria-current={actief(i) ? "page" : undefined} className={stijl(i)}>{i.label}</Link>)}
          </nav>
        )}
        <div className="ml-auto flex items-center gap-1 lg:hidden">
          {kort && uitloggen}
          {!kort && (
            <button type="button" aria-expanded={open} aria-controls="zijbalk-menu" onClick={() => setOpen((o) => !o)} className="rounded-md px-3 py-1.5 text-sm font-medium text-white/80 hover:bg-white/10 hover:text-white">
              {open ? "Sluiten" : "Menu"}
            </button>
          )}
        </div>
      </div>
      {/* Breed scherm: altijd zichtbaar. Smal scherm: alleen na het openen, en alleen als er meer dan twee onderdelen zijn. */}
      <div id="zijbalk-menu" className={`${open && !kort ? "block" : "hidden"} px-3 pb-4 lg:block lg:flex-1 lg:pb-5`}>
        <div className={kort ? "hidden lg:block" : ""}>{lijst}</div>
      </div>
      <div className={`${open && !kort ? "block" : "hidden"} border-t border-white/10 px-3 py-3 lg:block`}>
        <div className={kort ? "hidden lg:block" : ""}>{uitloggen}</div>
      </div>
    </aside>
  );
}
