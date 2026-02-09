import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const ALLOWED_ORIGINS = new Set([
  "http://localhost:3000",
  "http://127.0.0.1:3000",
]);

export function proxy(request: NextRequest) {
  // Only apply CORS to API routes
  if (!request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  const origin = request.headers.get("origin");

  // Handle preflight (OPTIONS)
  if (request.method === "OPTIONS") {
    const response = new NextResponse(null, { status: 204 });
    if (origin && ALLOWED_ORIGINS.has(origin)) {
      response.headers.set("Access-Control-Allow-Origin", origin);
    }
    response.headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    response.headers.set(
      "Access-Control-Allow-Headers",
      "Content-Type, x-auth-token"
    );
    response.headers.set("Access-Control-Max-Age", "86400");
    return response;
  }

  // For actual requests, set CORS headers
  const response = NextResponse.next();
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    response.headers.set("Access-Control-Allow-Origin", origin);
  }
  // Block requests from non-allowed origins (except no-origin requests like server-side)
  if (origin && !ALLOWED_ORIGINS.has(origin)) {
    return new NextResponse("CORS origin not allowed", { status: 403 });
  }

  return response;
}

export const config = {
  matcher: "/api/:path*",
};
