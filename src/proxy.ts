import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATHS = ["/login", "/api/auth", "/api/cron"];

/**
 * Auth gate. When Supabase env vars are absent the app runs in demo mode
 * (single fixed session, clearly labeled). Once configured, every
 * non-public route requires a session that exists in `authorized_users`.
 */
export async function proxy(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return NextResponse.next(); // demo mode

  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;
  const isPublic = PUBLIC_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );

  if (
    user &&
    pathname === "/login" &&
    request.nextUrl.searchParams.get("error") === "not_authorized"
  ) {
    await supabase.auth.signOut();
    return response;
  }

  if (user && (!isPublic || pathname === "/login")) {
    const { data: assurance } =
      await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    const needsMfa =
      assurance?.nextLevel === "aal2" && assurance.currentLevel !== "aal2";
    if (needsMfa) {
      if (pathname.startsWith("/api/")) {
        return Response.json({ error: "MFA required" }, { status: 401 });
      }
      if (pathname !== "/login") {
        const redirect = request.nextUrl.clone();
        redirect.pathname = "/login";
        redirect.search = "?mfa=1";
        return NextResponse.redirect(redirect);
      }
      return response;
    }
  }

  if (!user && !isPublic) {
    const redirect = request.nextUrl.clone();
    redirect.pathname = "/login";
    redirect.search = "";
    return NextResponse.redirect(redirect);
  }
  if (user && pathname === "/login") {
    const redirect = request.nextUrl.clone();
    redirect.pathname = "/overview";
    redirect.search = "";
    return NextResponse.redirect(redirect);
  }
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|sw\\.js$|manifest\\.webmanifest$|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
