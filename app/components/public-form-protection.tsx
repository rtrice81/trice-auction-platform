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
  responseInputRef: RefObject<HTMLInputElement | null>;
};

function reportTurnstileToken(token: string, form: HTMLFormElement | null) {
  const formData = form ? new FormData(form) : null;
  const submittedToken = String(formData?.get("cf-turnstile-response") ?? "");
  console.info("turnstile-client-token", {
    hasToken: Boolean(token),
    tokenLength: token.length,
    formDataHasToken: Boolean(submittedToken),
  });
  return Boolean(formData?.has("cf-turnstile-response") && submittedToken);
}

export function reportTurnstileFormSubmission(form: HTMLFormElement) {
  const token = String(new FormData(form).get("cf-turnstile-response") ?? "");
  return reportTurnstileToken(token, form);
}

export function PublicFormProtection({ siteKey, formStartToken, onTokenChange, responseInputRef }: PublicFormProtectionProps) {
  const widget = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | undefined>(undefined);
  const [hasToken, setHasToken] = useState(false);
  const statusId = useId();

  useEffect(() => {
    onTokenChange(false);
    setHasToken(false);

    const clearTokenAndReset = () => {
      if (responseInputRef.current) {
        responseInputRef.current.value = "";
        responseInputRef.current.defaultValue = "";
      }
      setHasToken(false);
      onTokenChange(false);
      if (widgetId.current) window.turnstile?.reset(widgetId.current);
    };

    const render = () => {
      if (!siteKey || !widget.current || widgetId.current || !window.turnstile) return;
      widgetId.current = window.turnstile.render(widget.current, {
        sitekey: siteKey,
        callback: (nextToken) => {
          // This exact input is rendered directly by the route's <Form>. Update it
          // synchronously before React Router can construct its native FormData.
          if (responseInputRef.current) {
            responseInputRef.current.value = nextToken;
            responseInputRef.current.defaultValue = nextToken;
          }
          const hasSubmittedToken = reportTurnstileToken(nextToken, responseInputRef.current?.form ?? null);
          setHasToken(Boolean(nextToken));
          onTokenChange(Boolean(nextToken) && hasSubmittedToken);
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
    <div aria-hidden="true" className="absolute h-px w-px overflow-hidden whitespace-nowrap [clip:rect(0,0,0,0)]"><label>Company website<input tabIndex={-1} autoComplete="off" name="companyWebsite"/></label></div>
    <div ref={widget} className="cf-turnstile" aria-describedby={hasToken ? undefined : statusId}/>
    {!hasToken && <p id={statusId} role="status" className="text-sm text-stone-600">Complete the security check before submitting.</p>}
  </>;
}
