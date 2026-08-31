import { env } from "cloudflare:workers";
import { Link, Outlet, useLocation } from "react-router";

import type { Route } from "./+types/admin.layout";
import { getVisibleAdminNavigation, type AdminNavigationItem, type VisibleAdminNavigation } from "../config/admin-navigation";
import { hasPermission, requireRole } from "../services/auth.server";

const runtime = env as unknown as { AUTH_SECRET?: string; BETTER_AUTH_URL?: string };

export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireRole(request, env.trice_auction_db, runtime, "admin");
  return { navigation: getVisibleAdminNavigation(user, hasPermission) };
}

export default function AdminLayout({ loaderData }: Route.ComponentProps) {
  const { pathname } = useLocation();

  return (
    <div className="ta-admin min-h-screen">
      <div className="mx-auto max-w-screen-2xl md:flex">
        <aside className="border-b border-[#d7d9dc] bg-white md:min-h-screen md:w-72 md:border-r md:border-b-0">
          <div className="p-4 md:sticky md:top-0">
            <Link to="/admin/schedule" className="block text-sm font-bold tracking-[0.16em] text-[#9d302f] uppercase">Administration</Link>
            <p className="mt-1 text-sm text-[#666a70]">Auction operations</p>
            <details className="group mt-4 md:hidden">
              <summary className="cursor-pointer rounded-md border border-[#c9cdd2] px-3 py-2 font-semibold marker:hidden">Admin menu <span className="float-right group-open:rotate-180">⌄</span></summary>
              <AdminMenu navigation={loaderData.navigation} pathname={pathname} className="mt-3" />
            </details>
            <AdminMenu navigation={loaderData.navigation} pathname={pathname} className="mt-6 hidden md:block" />
          </div>
        </aside>
        <div className="min-w-0 flex-1">
          <div className="border-b border-[#d7d9dc] bg-white px-6 py-4 text-sm font-semibold text-[#666a70] md:px-10">Admin workspace</div>
          <Outlet />
        </div>
      </div>
    </div>
  );
}

function AdminMenu({ navigation, pathname, className }: { navigation: VisibleAdminNavigation; pathname: string; className?: string }) {
  return (
    <nav aria-label="Admin navigation" className={className}>
      {navigation.map((module) => {
        const moduleIsActive = module.items.some((item) => isActive(item, pathname));
        return (
          <section key={module.label} className={moduleIsActive ? "mb-5 rounded-lg bg-[#f8eded] p-2" : "mb-5 p-2"}>
            <h2 className={moduleIsActive ? "px-2 text-xs font-bold tracking-[0.14em] text-[#9d302f] uppercase" : "px-2 text-xs font-bold tracking-[0.14em] text-stone-500 uppercase"}>{module.label}</h2>
            <ul className="mt-2 space-y-1">
              {module.items.map((item) => {
                const active = isActive(item, pathname);
                return <li key={item.path}><Link to={item.path} aria-current={active ? "page" : undefined} className={active ? "block rounded-md bg-[#9d302f] px-3 py-2 text-sm font-semibold text-white" : "block rounded-md px-3 py-2 text-sm font-medium text-stone-700 hover:bg-[#f3f4f6] hover:text-[#9d302f]"}>{item.label}</Link></li>;
              })}
            </ul>
          </section>
        );
      })}
    </nav>
  );
}

function isActive(item: AdminNavigationItem, pathname: string) {
  if (item.path === "/admin/schedule") return pathname === item.path || /^\/admin\/schedule\/\d+$/.test(pathname);
  return pathname === item.path;
}
