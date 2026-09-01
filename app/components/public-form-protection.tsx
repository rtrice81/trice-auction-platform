import { useEffect, useId, useRef, useState, type RefObject } from "react";

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
  turnstileTokenRef: RefObject<string>;
};

export function PublicFormProtection({ siteKey, formStartToken, onTokenChange, turnstileTokenRef }: PublicFormProtectionProps) {
  const widget = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | undefined>(undefined);
  const [hasToken, setHasToken] = useState(false);
  const statusId = useId();

  useEffect(() => {
    onTokenChange(false);
    setHasToken(false);

    const clearTokenAndReset = () => {
      turnstileTokenRef.current = "";
      setHasToken(false);
      onTokenChange(false);
      if (widgetId.current) window.turnstile?.reset(widgetId.current);
    };

    const render = () => {
      if (!siteKey || !widget.current || widgetId.current || !window.turnstile) return;
      widgetId.current = window.turnstile.render(widget.current, {
        sitekey: siteKey,
        callback: (nextToken) => {
          turnstileTokenRef.current = nextToken;
          setHasToken(Boolean(nextToken));
          onTokenChange(Boolean(nextToken));
        },
        "expired-callback": clearTokenAndReset,
        "error-callback": clearTokenAndReset,
        // The application writes the widget token to the exact FormData it submits.
        // This avoids Turnstile creating a second DOM response field.
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
    <div aria-hidden="true" className="absolute h-px w-px overflow-hidden whitespace-nowrap [clip:rect(0,0,0,0)]"><label>Company website<input tabIndex={-1} autoComplete="off" name="companyWebsite"/></label></div>
    <div ref={widget} className="cf-turnstile" aria-describedby={hasToken ? undefined : statusId}/>
    {!hasToken && <p id={statusId} role="status" className="text-sm text-stone-600">Complete the security check before submitting.</p>}
  </>;
}
