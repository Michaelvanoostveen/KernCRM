import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { maakServerClient } from "@/lib/supabase/server";
import Menu from "./menu";

async function uitloggen() {
  "use server";
  const supabase = await maakServerClient();
  await supabase.auth.signOut();
  redirect("/login");
}

const UITLOGGEN = (
  <form action={uitloggen}>
    <button className="w-full rounded-md px-3 py-2 text-left text-sm font-medium text-white/80 hover:bg-white/10 hover:text-white lg:text-left">Uitloggen</button>
  </form>
);

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen lg:flex">
      <Suspense fallback={
        <aside className="bg-[#24332B] text-white print:hidden lg:h-screen lg:w-60 lg:shrink-0">
          <div className="px-4 py-3 lg:px-5 lg:py-5"><Link href="/" className="text-lg font-bold tracking-tight">KernCRM</Link></div>
        </aside>
      }>
        <Menu uitloggen={UITLOGGEN} />
      </Suspense>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
