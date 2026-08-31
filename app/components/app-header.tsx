import { Form, Link } from "react-router";

import type { ApplicationUser } from "../services/auth.server";

export function AppHeader({ user, logo }: { user: ApplicationUser | null; logo: { updatedAt: string } | null }) {
  const canUseEmployeeTools = user?.role === "employee" || user?.role === "manager" || user?.role === "admin";
  return <header className="ta-site-header">
    <div className="ta-utility"><div className="ta-utility-inner"><span>Trice Auctions · Consignment services</span><div>{user ? <><span className="hidden sm:inline">Signed in as {user.name}</span><Form action="/logout" method="post" className="inline"><button>Log out</button></Form></> : <><Link to="/login">Log in</Link><Link to="/register">Create account</Link></>}</div></div></div>
    <div className="ta-main-nav"><Link to="/" className="ta-brand">{logo ? <img src={`/branding/logo?v=${encodeURIComponent(logo.updatedAt)}`} alt="Trice Auctions" /> : <><strong>Trice Auctions</strong><span>Consignment &amp; estate auctions</span></>}</Link><nav aria-label="Primary navigation" className="ta-primary-nav"><Link to="/">Schedule Drop-Off</Link>{user ? <><Link to="/my-appointments">My Appointments</Link><Link to="/profile">My Profile</Link>{canUseEmployeeTools ? <Link to="/employee">Employee</Link> : null}{user.role === "admin" ? <Link to="/admin/schedule">Admin</Link> : null}</> : <><Link to="/login">Account</Link></>}</nav></div>
  </header>;
}
