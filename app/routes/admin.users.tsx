import { env } from "cloudflare:workers";
import { data, Form, Link } from "react-router";
import type { Route } from "./+types/admin.users";
import { requireRole } from "../services/auth.server";
import {
  changeManagedUserRole,
  listManagedUsers,
  setManagedUserActive,
  type UserManagementResult,
} from "../services/user-management.server";

const runtime = env as unknown as { AUTH_SECRET?: string; BETTER_AUTH_URL?: string };

export function meta({}: Route.MetaArgs) {
  return [
    { title: "User Management | Trice Auctions" },
    { name: "description", content: "Manage application user access." },
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireRole(request, env.trice_auction_db, runtime, "admin");
  const search = new URL(request.url).searchParams.get("q") ?? "";
  return { search, users: await listManagedUsers(env.trice_auction_db, search) };
}

export async function action({ request }: Route.ActionArgs) {
  const actor = await requireRole(request, env.trice_auction_db, runtime, "admin");
  const form = await request.formData();
  const targetUserId = Number(form.get("targetUserId"));
  const intent = String(form.get("intent") ?? "");

  let result: UserManagementResult;
  switch (intent) {
    case "change-role":
      result = await changeManagedUserRole(env.trice_auction_db, {
        actorUserId: actor.id,
        targetUserId,
        role: String(form.get("role") ?? ""),
      });
      break;
    case "set-active":
      result = await setManagedUserActive(env.trice_auction_db, {
        targetUserId,
        active: form.get("active") === "true",
      });
      break;
    default:
      result = { ok: false, errors: ["Unknown user-management action."] };
  }

  return data(result, { status: result.ok ? 200 : 400 });
}

export default function AdminUsers({ loaderData, actionData }: Route.ComponentProps) {
  return (
    <main className="min-h-screen bg-stone-50 text-stone-900">
      <div className="mx-auto max-w-6xl px-6 py-12 sm:py-16">
        <header className="mb-8 flex flex-wrap items-end justify-between gap-4 border-b border-stone-200 pb-8">
          <div>
            <p className="mb-3 text-sm font-semibold tracking-[0.18em] text-amber-700 uppercase">
              Trice Auctions · Administration
            </p>
            <h1 className="text-4xl font-bold tracking-tight text-stone-950">User Management</h1>
            <p className="mt-3 max-w-2xl text-stone-600">
              Change application roles and account access. At least one active admin is always required.
            </p>
          </div>
          <Link to="/" className="text-sm font-semibold text-amber-800">View booking page →</Link>
        </header>

        {actionData?.ok ? <Notice variant="success">{actionData.message}</Notice> : null}
        {actionData && !actionData.ok ? (
          <Notice variant="error">
            <ul className="list-disc space-y-1 pl-5">
              {actionData.errors.map((error) => <li key={error}>{error}</li>)}
            </ul>
          </Notice>
        ) : null}

        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end">
          <Form method="get" className="flex flex-1 flex-wrap gap-3">
            <label className="sr-only" htmlFor="user-search">Search users</label>
            <input
              id="user-search"
              type="search"
              name="q"
              defaultValue={loaderData.search}
              placeholder="Search users"
              className="min-w-0 flex-1 rounded-lg border border-stone-300 bg-white px-3 py-2.5 sm:max-w-md"
            />
            <button className="rounded-lg bg-stone-900 px-4 py-2.5 text-sm font-semibold text-white">Search</button>
            {loaderData.search ? <Link to="/admin/users" className="px-3 py-2.5 text-sm font-semibold text-amber-800">Clear</Link> : null}
          </Form>
          <Link to="/admin/customers/new" className="shrink-0 rounded-lg bg-amber-700 px-4 py-2.5 text-center text-sm font-semibold text-white hover:bg-amber-800">+ New Customer</Link>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-stone-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-stone-200 text-left text-sm">
            <thead className="bg-stone-100 text-stone-700">
              <tr>
                <th className="px-4 py-3 font-semibold">User</th>
                <th className="px-4 py-3 font-semibold">Role</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Created</th>
                <th className="px-4 py-3 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {loaderData.users.map((user) => (
                <tr key={user.id} className={user.active ? "" : "bg-stone-50 text-stone-500"}>
                  <td className="px-4 py-4">
                    <div className="font-semibold text-stone-950">{user.name}</div>
                    <div>{user.email}</div>
                  </td>
                  <td className="px-4 py-4 capitalize">{user.role}</td>
                  <td className="px-4 py-4">
                    <span className={user.active ? "font-semibold text-emerald-700" : "font-semibold text-stone-500"}>
                      {user.active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-4">{user.createdAt}</td>
                  <td className="px-4 py-4"><Link to={`/admin/users/${user.id}/edit`} className="font-semibold text-amber-800 underline">Edit</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
          {loaderData.users.length === 0 ? <p className="p-6 text-stone-600">No users match that search.</p> : null}
        </div>
      </div>
    </main>
  );
}

function Notice({ variant, children }: { variant: "success" | "error"; children: React.ReactNode }) {
  const classes = variant === "success"
    ? "border-emerald-200 bg-emerald-50 text-emerald-950"
    : "border-red-200 bg-red-50 text-red-950";
  return <div className={`mb-6 rounded-xl border px-5 py-4 text-sm ${classes}`} role={variant === "success" ? "status" : "alert"}>{children}</div>;
}
