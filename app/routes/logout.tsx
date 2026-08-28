import { env } from "cloudflare:workers";
import { redirect } from "react-router";
import type { Route } from "./+types/logout";
import { getAuth } from "../services/auth.server";
export async function action({ request }: Route.ActionArgs) { const auth = getAuth(env.trice_auction_db, env as unknown as { AUTH_SECRET?: string; BETTER_AUTH_URL?: string }); const response = await auth.handler(new Request(new URL("/api/auth/sign-out", request.url), { method: "POST", headers: request.headers })); return redirect("/", { headers: response.headers }); }
