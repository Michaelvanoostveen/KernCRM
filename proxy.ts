import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Ververst de sessie bij elk verzoek en stuurt niet-ingelogde bezoekers naar /login.
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(items) {
          items.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          items.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );

  const { data } = await supabase.auth.getUser();
  const opLogin = request.nextUrl.pathname.startsWith("/login");
  // De online offerte voor de klant is bereikbaar met de geheime link, zonder inloggen.
  const openbaar = request.nextUrl.pathname.startsWith("/o/");

  if (!data.user && !opLogin && !openbaar) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  if (data.user && opLogin) {
    return NextResponse.redirect(new URL("/", request.url));
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
