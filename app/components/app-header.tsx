import { Form, Link } from "react-router";

import type { ApplicationUser } from "../services/auth.server";

export function AppHeader({ user, logo }: { user: ApplicationUser | null; logo: { updatedAt: string } | null }) {
  return <header className="ta-site-header print-hide">
    <div className="ta-utility"><div className="ta-utility-inner"><span>Trice Auctions · Consignment services</span><div>{user ? <><Link to="/profile" className="-mx-1 hidden rounded-sm px-1 underline-offset-4 transition hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#9d302f] sm:inline-block">Signed in as {user.name}</Link><Form action="/logout" method="post" className="inline"><button>Log out</button></Form></> : <><Link to="/login">Log In</Link><Link to="/register">Create Auction</Link></>}</div></div></div>
    <div className="ta-main-nav"><Link to="/" className="ta-brand">{logo ? <img src={`/branding/logo?v=${encodeURIComponent(logo.updatedAt)}`} alt="Trice Auctions" /> : <><strong>Trice Auctions</strong><span>Consignment &amp; estate auctions</span></>}</Link><nav aria-label="Primary navigation" className="ta-primary-nav"><Link to="/">Schedule Drop-Off</Link>{user ? <><Link to="/my-appointments">My Appointments</Link><Link to="/profile">Account</Link>{user.role === "admin" ? <Link to="/admin/schedule">Admin</Link> : null}</> : null}</nav></div>
  </header>;
}
