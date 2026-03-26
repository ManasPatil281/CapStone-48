import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers
    }
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          request.cookies.set({
            name,
            value,
            ...options
          });
          response = NextResponse.next({
            request: {
              headers: request.headers
            }
          });
          response.cookies.set({
            name,
            value,
            ...options
          });
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({
            name,
            value: "",
            ...options
          });
          response = NextResponse.next({
            request: {
              headers: request.headers
            }
          });
          response.cookies.set({
            name,
            value: "",
            ...options
          });
        }
      }
    }
  );

  const {
    data: { user }
  } = await supabase.auth.getUser();

  // Protected routes that require authentication
  const protectedPaths = ["/dashboard", "/teacher"];
  const isProtectedRoute = protectedPaths.some((path) => request.nextUrl.pathname.startsWith(path));

  // Redirect to sign-in if accessing protected route without auth
  if (isProtectedRoute && !user) {
    const redirectUrl = new URL("/sign-in", request.url);
    return NextResponse.redirect(redirectUrl);
  }

  // Role-based access for /teacher routes
  if (request.nextUrl.pathname.startsWith("/teacher") && user) {
    const { data: profile, error } = await supabase.from("user_profile").select("role").eq("id", user.id).maybeSingle();

    if (error) {
      console.error("[middleware] Error fetching user_profile role:", error);
    }

    const rawRole = profile?.role;
    // Normalize role to handle case variations and whitespace
    const role = rawRole ? rawRole.trim().toUpperCase() : null;

    if (role !== "TEACHER" && role !== "ADMIN") {
      console.warn("[middleware] Access denied to /teacher for user:", user.id, "role:", rawRole);
      const redirectUrl = new URL("/dashboard", request.url);
      return NextResponse.redirect(redirectUrl);
    }
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public (public files)
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"
  ]
};
