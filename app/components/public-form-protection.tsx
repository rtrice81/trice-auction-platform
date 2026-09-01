import { useEffect, useId, useRef, useState } from "react";

type TurnstileOptions = {
  sitekey: string;
  callback: (token: string) => void;
  "expired-callback": () => void;
  "error-callback": () => void;
  "response-field": false;
  theme: "auto";
  size: "flexible";
};

type Turnstile = {
  render: (container: HTMLElement, options: TurnstileOptions) => string;
  reset: (widgetId?: string) => void;
  remove: (widgetId?: string) => void;
};

declare global {
  interface Window {
    turnstile?: Turnstile;
  }
}

const TURNSTILE_SCRIPT_ID = "trice-turnstile-api";

type PublicFormProtectionProps = {
  siteKey: string;
  formStartToken: string;
  onTokenChange: (hasToken: boolean) => void;
};

export function PublicFormProtection({ siteKey, formStartToken, onTokenChange }: PublicFormProtectionProps) {
  const widget = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | undefined>(undefined);
  const [token, setToken] = useState("");
  const statusId = useId();

  useEffect(() => {
    onTokenChange(false);
    setToken("");

    const clearTokenAndReset = () => {
      setToken("");
      onTokenChange(false);
      if (widgetId.current) window.turnstile?.reset(widgetId.current);
    };

    const render = () => {
      if (!siteKey || !widget.current || widgetId.current || !window.turnstile) return;
      widgetId.current = window.turnstile.render(widget.current, {
        sitekey: siteKey,
        callback: (nextToken) => {
          setToken(nextToken);
          onTokenChange(true);
        },
        "expired-callback": clearTokenAndReset,
        "error-callback": clearTokenAndReset,
        // React controls the only response field in this form. This avoids duplicate
        // cf-turnstile-response inputs when React Router builds FormData.
        "response-field": false,
        theme: "auto",
        size: "flexible",
      });
    };

    const existing = document.getElementById(TURNSTILE_SCRIPT_ID) as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener("load", render);
      render();
    } else {
      const script = document.createElement("script");
      script.id = TURNSTILE_SCRIPT_ID;
      script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      script.async = true;
      script.onload = render;
      document.head.appendChild(script);
    }

    return () => {
      existing?.removeEventListener("load", render);
      if (widgetId.current) window.turnstile?.remove(widgetId.current);
      widgetId.current = undefined;
    };
  }, [onTokenChange, siteKey]);

  return <>
    <input type="hidden" name="formStartToken" value={formStartToken}/>
    <input type="hidden" name="cf-turnstile-response" value={token}/>
    <div aria-hidden="true" className="absolute h-px w-px overflow-hidden whitespace-nowrap [clip:rect(0,0,0,0)]"><label>Company website<input tabIndex={-1} autoComplete="off" name="companyWebsite"/></label></div>
    <div ref={widget} className="cf-turnstile" aria-describedby={token ? undefined : statusId}/>
    {!token && <p id={statusId} role="status" className="text-sm text-stone-600">Complete the security check before submitting.</p>}
  </>;
}
