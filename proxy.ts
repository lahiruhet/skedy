import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";

const digest = (value: string) => createHash("sha256").update(value).digest();

// Skedy is a single personal watchlist with write endpoints, so the whole app sits behind one password.
// Locally the prompt is skipped when SKEDY_PASSWORD is unset; on Vercel a missing password fails closed.
export function proxy(request: NextRequest) {
  const password = process.env.SKEDY_PASSWORD;
  if (!password) return process.env.VERCEL ? new NextResponse("Set SKEDY_PASSWORD in the Vercel project to open Skedy.", { status: 503 }) : NextResponse.next();
  const [scheme, encoded] = (request.headers.get("authorization") ?? "").split(" ");
  const supplied = scheme === "Basic" && encoded ? Buffer.from(encoded, "base64").toString("utf8").split(":").slice(1).join(":") : "";
  if (timingSafeEqual(digest(supplied), digest(password))) return NextResponse.next();
  return new NextResponse("Sign in to open Skedy.", { status: 401, headers: { "WWW-Authenticate": 'Basic realm="Skedy", charset="UTF-8"' } });
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|og.png).*)"] };
