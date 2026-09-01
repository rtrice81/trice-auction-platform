import { useEffect, useRef } from "react";

declare global { interface Window { turnstile?: { render: (container: HTMLElement, options: { sitekey: string }) => string } } }

const TURNSTILE_SCRIPT_ID = "trice-turnstile-api";

export function PublicFormProtection({ siteKey, formStartToken }: { siteKey: string; formStartToken: string }) {
  const widget = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const render = () => {
      if (!siteKey || !widget.current || widget.current.dataset.rendered || !window.turnstile) return;
      window.turnstile.render(widget.current, { sitekey: siteKey });
      widget.current.dataset.rendered = "true";
    };
    const existing = document.getElementById(TURNSTILE_SCRIPT_ID) as HTMLScriptElement | null;
    if (existing) { existing.addEventListener("load", render); render(); return () => existing.removeEventListener("load", render); }
    const script = document.createElement("script");
    script.id = TURNSTILE_SCRIPT_ID;
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    script.onload = render;
    document.head.appendChild(script);
    return () => script.removeEventListener("load", render);
  }, [siteKey]);
  return <><input type="hidden" name="formStartToken" value={formStartToken}/><div aria-hidden="true" className="absolute h-px w-px overflow-hidden whitespace-nowrap [clip:rect(0,0,0,0)]"><label>Company website<input tabIndex={-1} autoComplete="off" name="companyWebsite"/></label></div><div ref={widget} className="cf-turnstile"></div></>;
}
