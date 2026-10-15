// Pluggable CAPTCHA / bot-challenge verification.
//
// DISABLED unless CAPTCHA_SECRET is set, so dev, the e2e suite, and scripted API
// clients keep working with zero config. Once a secret is configured the register
// route requires a valid token (see routes/auth.js). Supports the two widely used
// siteverify APIs, which share the same request shape — Cloudflare Turnstile
// (default) and hCaptcha — selected with CAPTCHA_PROVIDER. Enabling it also needs
// the matching client widget (site key) wired into the Register form; see
// SECURITY.md.
const ENDPOINTS = {
  turnstile: 'https://challenges.cloudflare.com/turnstile/v0/siteverify',
  hcaptcha: 'https://hcaptcha.com/siteverify',
};

export function captchaEnabled() {
  return !!process.env.CAPTCHA_SECRET;
}

// Returns { ok }. ok:true when verification is disabled (nothing to check) or the
// token verifies with the provider; ok:false otherwise (with a short `reason`).
export async function verifyCaptcha(token, remoteIp) {
  const secret = process.env.CAPTCHA_SECRET;
  if (!secret) return { ok: true, skipped: true };
  if (!token || typeof token !== 'string') return { ok: false, reason: 'missing-token' };

  const provider = (process.env.CAPTCHA_PROVIDER || 'turnstile').toLowerCase();
  const url = ENDPOINTS[provider] || ENDPOINTS.turnstile;
  try {
    const form = new URLSearchParams({ secret, response: token });
    if (remoteIp) form.set('remoteip', remoteIp);
    const res = await fetch(url, { method: 'POST', body: form, signal: AbortSignal.timeout(5000) });
    const data = await res.json();
    return { ok: !!data.success, reason: Array.isArray(data['error-codes']) ? data['error-codes'].join(',') : undefined };
  } catch {
    // Verifier unreachable: fail CLOSED (reject) so a provider outage can't become
    // an open signup floodgate. Availability-over-strictness operators can front
    // this with a short cache or relax it here.
    return { ok: false, reason: 'verify-unreachable' };
  }
}
