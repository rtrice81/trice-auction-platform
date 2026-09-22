import { Link } from "react-router";

type UserSection = {
  label: string;
  path: string;
};

/**
 * Navigation scoped to one managed user. Add future user sections here as
 * their routes become available.
 */
export function AdminUserSubnav({ userId, activeSection }: { userId: number; activeSection: "overview" | "appointments" }) {
  const sections: readonly UserSection[] = [
    { label: "Overview", path: `/admin/users/${userId}` },
    { label: "Appointments", path: `/admin/users/${userId}/appointments` },
  ];

  return <nav aria-label="User sections" className="mt-6 overflow-x-auto border-b border-stone-200">
    <ul className="flex min-w-max gap-1" role="list">
      {sections.map((section) => {
        const active = section.label.toLowerCase() === activeSection;
        return <li key={section.path}><Link to={section.path} aria-current={active ? "page" : undefined} className={active ? "block border-b-2 border-amber-700 px-4 py-3 text-sm font-bold text-amber-800" : "block border-b-2 border-transparent px-4 py-3 text-sm font-semibold text-stone-600 hover:border-stone-300 hover:text-stone-950"}>{section.label}</Link></li>;
      })}
    </ul>
  </nav>;
}
