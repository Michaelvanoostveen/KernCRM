import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { maakServerClient } from "@/lib/supabase/server";
import Navigatie from "./navigatie";

async function uitloggen() {
  "use server";
  const supabase = await maakServerClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header className="border-b border-stone-200 bg-[#24332B] text-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <span className="text-lg font-bold tracking-tight">KernCRM</span>
          <Suspense fallback={<nav aria-label="Hoofdmenu" className="flex gap-1"><Link href="/klanten" className="px-3 py-1.5 text-sm text-white/75">Klanten</Link><Link href="/projecten" className="px-3 py-1.5 text-sm text-white/75">Projecten</Link><Link href="/instellingen/catalogus" className="px-3 py-1.5 text-sm text-white/75">Catalogus</Link><Link href="/instellingen/gebruikers" className="px-3 py-1.5 text-sm text-white/75">Gebruikers</Link></nav>}>
            <Navigatie />
          </Suspense>
          <form action={uitloggen} className="ml-auto">
            <button className="rounded-md px-3 py-1.5 text-sm font-medium text-white/80 hover:bg-white/10 hover:text-white">Uitloggen</button>
          </form>
        </div>
      </header>
      {children}
    </>
  );
}
