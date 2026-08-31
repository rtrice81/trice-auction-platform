import { env } from "cloudflare:workers";

import type { Route } from "./+types/branding.logo";
import { getSiteLogo } from "../services/branding.server";

export async function loader({ request }: Route.LoaderArgs) {
  const logo = await getSiteLogo(env.trice_auction_db);
  if (!logo) throw new Response("Not Found", { status: 404 });

  const object = await env.branding_assets.get(logo.objectKey);
  if (!object) throw new Response("Not Found", { status: 404 });

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("Cache-Control", "public, max-age=300");
  headers.set("ETag", object.httpEtag);
  if (request.headers.get("If-None-Match") === object.httpEtag) return new Response(null, { status: 304, headers });
  return new Response(object.body, { headers });
}
