import type { ButtonHTMLAttributes, ReactNode } from "react";

export function PageShell({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <main className={`ta-page ${className}`}>{children}</main>;
}

export function PageIntro({ eyebrow = "Trice Auctions", title, children }: { eyebrow?: string; title: string; children?: ReactNode }) {
  return <header className="ta-page-intro"><p className="ta-eyebrow">{eyebrow}</p><h1>{title}</h1>{children ? <p>{children}</p> : null}</header>;
}

export function PageCard({ title, children, className = "" }: { title: string; children: ReactNode; className?: string }) {
  return <section className={`ta-card ${className}`}><h2 className="ta-card-heading">{title}</h2><div className="ta-card-body">{children}</div></section>;
}

export function Notice({ variant, children }: { variant: "success" | "warning" | "error"; children: ReactNode }) {
  return <div className={`ta-notice ta-notice-${variant}`} role={variant === "error" ? "alert" : "status"}>{children}</div>;
}

export function Button({ variant = "primary", className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "destructive" }) {
  return <button {...props} className={`ta-button ta-button-${variant} ${className}`} />;
}

export function FormField({ label, children, hint, className = "" }: { label: string; children: ReactNode; hint?: ReactNode; className?: string }) {
  return <label className={`ta-field ${className}`}><span>{label}</span>{children}{hint ? <small>{hint}</small> : null}</label>;
}
