import { env } from "cloudflare:workers";

import type { Route } from "./+types/api.auth";
import { getAuth } from "../services/auth.server";

export async function loader({ request }: Route.LoaderArgs) {
  return getAuth(env.trice_auction_db, env as unknown as { AUTH_SECRET?: string; BETTER_AUTH_URL?: string }).handler(request);
}

export async function action({ request }: Route.ActionArgs) {
  return getAuth(env.trice_auction_db, env as unknown as { AUTH_SECRET?: string; BETTER_AUTH_URL?: string }).handler(request);
}
