import { env } from "cloudflare:workers";
import { data, Form, Link } from "react-router";

import type { Route } from "./+types/admin.branding";
import { getSiteLogo, removeSiteLogo, saveSiteLogo, type BrandingResult } from "../services/branding.server";
import { requireRole } from "../services/auth.server";

const runtime = env as unknown as { AUTH_SECRET?: string; BETTER_AUTH_URL?: string };

export function meta({}: Route.MetaArgs) {
  return [{ title: "Branding | Trice Auctions" }, { name: "description", content: "Manage the site logo." }];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireRole(request, env.trice_auction_db, runtime, "admin");
  const logo = await getSiteLogo(env.trice_auction_db);
  return { logo: logo ? { updatedAt: logo.updatedAt } : null };
}

export async function action({ request }: Route.ActionArgs) {
  await requireRole(request, env.trice_auction_db, runtime, "admin");
  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "");

  let result: BrandingResult;
  if (intent === "upload") {
    const file = formData.get("logo");
    result = file instanceof File
      ? await saveSiteLogo(env.trice_auction_db, env.branding_assets, file)
      : { ok: false, errors: ["Choose an image file to upload."] };
  } else if (intent === "remove") {
    result = await removeSiteLogo(env.trice_auction_db, env.branding_assets);
  } else {
    result = { ok: false, errors: ["Unknown branding action."] };
  }

  return data(result, { status: result.ok ? 200 : 400 });
}

export default function AdminBranding({ loaderData, actionData }: Route.ComponentProps) {
  return (
    <main className="ta-page ta-admin-page">
      <div className="max-w-4xl">
        <header className="mb-8 flex flex-wrap items-end justify-between gap-4 border-b border-stone-200 pb-8">
          <div>
            <p className="mb-3 text-sm font-semibold tracking-[0.18em] text-amber-700 uppercase">Trice Auctions · System</p>
            <h1 className="text-4xl font-bold tracking-tight text-stone-950">Branding</h1>
            <p className="mt-3 max-w-2xl text-stone-600">Upload the logo displayed in the application header. Without one, the standard text branding is used.</p>
          </div>
          <Link to="/" className="text-sm font-semibold text-amber-800 hover:text-amber-950">View site →</Link>
        </header>

        {actionData?.ok ? <Notice variant="success">{actionData.message}</Notice> : null}
        {actionData && !actionData.ok ? <Notice variant="error">{actionData.errors.join(" ")}</Notice> : null}

        <section className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm" aria-labelledby="current-logo-heading">
          <h2 id="current-logo-heading" className="text-xl font-semibold">Current logo</h2>
          <div className="mt-5 flex min-h-28 items-center rounded-xl border border-dashed border-stone-300 bg-stone-50 p-5">
            {loaderData.logo ? <img src={`/branding/logo?v=${encodeURIComponent(loaderData.logo.updatedAt)}`} alt="Current Trice Auctions logo" className="max-h-20 max-w-72 object-contain" /> : <span className="font-bold text-stone-900">Trice Auctions</span>}
          </div>
          {loaderData.logo ? <Form method="post" className="mt-5"><input type="hidden" name="intent" value="remove" /><button type="submit" className="rounded-lg border border-red-300 px-4 py-2.5 text-sm font-semibold text-red-800 hover:bg-red-50">Remove logo</button></Form> : null}
        </section>

        <section className="mt-6 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm" aria-labelledby="upload-logo-heading">
          <h2 id="upload-logo-heading" className="text-xl font-semibold">{loaderData.logo ? "Replace logo" : "Upload logo"}</h2>
          <p className="mt-2 text-sm leading-6 text-stone-600">PNG, JPEG, or WebP only. Maximum file size: 2 MB.</p>
          <Form method="post" encType="multipart/form-data" className="mt-5 flex flex-wrap items-end gap-4">
            <input type="hidden" name="intent" value="upload" />
            <label className="block flex-1 text-sm font-semibold text-stone-800">Logo image<input required type="file" name="logo" accept="image/png,image/jpeg,image/webp" className="mt-2 block w-full rounded-lg border border-stone-300 bg-white p-2 text-sm font-normal" /></label>
            <button type="submit" className="rounded-lg bg-stone-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-amber-700">{loaderData.logo ? "Replace logo" : "Upload logo"}</button>
          </Form>
        </section>
      </div>
    </main>
  );
}

function Notice({ variant, children }: { variant: "success" | "error"; children: React.ReactNode }) {
  const classes = variant === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-950" : "border-red-200 bg-red-50 text-red-950";
  return <div role={variant === "success" ? "status" : "alert"} className={`mb-6 rounded-xl border px-5 py-4 text-sm ${classes}`}>{children}</div>;
}
