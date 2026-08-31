import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from "react-router";

import type { Route } from "./+types/root";
import { env } from "cloudflare:workers";
import { Form, Link } from "react-router";
import { getCurrentUser } from "./services/auth.server";
import "./app.css";

export const links: Route.LinksFunction = () => [
  { rel: "preconnect", href: "https://fonts.googleapis.com" },
  {
    rel: "preconnect",
    href: "https://fonts.gstatic.com",
    crossOrigin: "anonymous",
  },
  {
    rel: "stylesheet",
    href: "https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&display=swap",
  },
];

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export async function loader({ request }: Route.LoaderArgs) {
  return { user: await getCurrentUser(request, env.trice_auction_db, env as unknown as { AUTH_SECRET?: string; BETTER_AUTH_URL?: string }) };
}

export default function App({ loaderData }: Route.ComponentProps) {
  const user = loaderData.user;
  const canUseEmployeeTools = user?.role === "employee" || user?.role === "manager" || user?.role === "admin";
  return <><nav className="flex items-center justify-between border-b bg-white px-6 py-3 text-sm"><Link to="/" className="font-bold">Trice Auctions</Link>{user ? <div className="flex items-center gap-3"><Link to="/my-appointments">My Appointments</Link><Link to="/profile">My Profile</Link>{canUseEmployeeTools&&<Link to="/employee">Employee</Link>}{user.role === "admin"&&<Link to="/admin/schedule">Admin</Link>}<span>{user.name}</span><Form action="/logout" method="post"><button>Logout</button></Form></div> : <div className="flex gap-3"><Link to="/login">Login</Link><Link to="/register">Register</Link></div>}</nav><Outlet /></>;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let message = "Request failed";
  let details = "Something unexpected happened. Please try again.";

  if (isRouteErrorResponse(error)) {
    if (error.status === 404) {
      message = "Page not found";
      details = "The page or record you requested could not be found.";
    } else if (error.status === 403) {
      message = "Access denied";
      details = "You do not have permission to access this page.";
    } else if (error.status === 401) {
      message = "Sign in required";
      details = "Please sign in to continue.";
    } else {
      details = "We could not complete that request. Please try again.";
    }
  }

  return (
    <main className="pt-16 p-4 container mx-auto">
      <h1>{message}</h1>
      <p>{details}</p>
    </main>
  );
}
