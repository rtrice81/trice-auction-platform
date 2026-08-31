export function PublicFormProtection({ siteKey, formStartToken }: { siteKey: string; formStartToken: string }) {
  return <><input type="hidden" name="formStartToken" value={formStartToken}/><div aria-hidden="true" className="absolute h-px w-px overflow-hidden whitespace-nowrap [clip:rect(0,0,0,0)]"><label>Company website<input tabIndex={-1} autoComplete="off" name="companyWebsite"/></label></div><script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script><div className="cf-turnstile" data-sitekey={siteKey}></div></>;
}
