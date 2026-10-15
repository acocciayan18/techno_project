// Outbound mail for password recovery.
//
// Delivery uses Brevo's transactional email HTTP API when configured; otherwise
// a dev fallback logs the reset link to the server console (zero external setup).
// The forgot-password endpoint always responds generically regardless of what
// happens here, so delivery success/failure is never leaked to the caller.
//
// Every message is sent as a branded HTML part WITH a plain-text alternative
// (built in lib/emailTemplates.js) so it renders in rich clients and stays
// readable / deliverable in text-only ones.
//
// Required env vars to send real mail:
//   BREVO_API_KEY     your Brevo API key (starts with "xkeysib-")
//   SMTP_FROM         a sender address VERIFIED in your Brevo account
//   MAIL_FROM_NAME    optional display name (defaults to APP_NAME)
//   MAIL_REPLY_TO     optional Reply-To address (support inbox)

import { passwordResetEmail } from './emailTemplates.js';

const APP_NAME = 'TagBack';
const BREVO_ENDPOINT = 'https://api.brevo.com/v3/smtp/email';

async function transport({ to, subject, html, text }) {
  const apiKey = process.env.BREVO_API_KEY;
  const fromEmail = process.env.SMTP_FROM;

  // Not configured → let the caller fall back to the dev console log.
  if (!apiKey || !fromEmail) return false;

  if (typeof fetch !== 'function') {
    console.error('[mailer] global fetch unavailable — needs Node 18+. Falling back to console log.');
    return false;
  }

  const payload = {
    sender: { email: fromEmail, name: process.env.MAIL_FROM_NAME || APP_NAME },
    to: [{ email: to }],
    subject,
    htmlContent: html,
    textContent: text,
  };
  const replyTo = process.env.MAIL_REPLY_TO;
  if (replyTo) payload.replyTo = { email: replyTo };

  try {
    const res = await fetch(BREVO_ENDPOINT, {
      method: 'POST',
      headers: {
        'api-key': apiKey,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      console.error(`[mailer] Brevo send failed (${res.status}): ${detail}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error('[mailer] Brevo send error:', err);
    return false;
  }
}

// Sends the password-reset email. Returns true if handed to the provider, false
// if it fell back to the console (dev / misconfigured). Callers MUST stay generic
// to the end user regardless of this result (no enumeration / no delivery leak).
export async function sendPasswordReset({ to, link, name = '', minutes = 60 }) {
  const { subject, html, text } = passwordResetEmail({ link, minutes, name });

  const sent = await transport({ to, subject, html, text });
  if (!sent) {
    // Dev fallback: make the link copy-pasteable from the server log.
    console.log(
      '\n========== PASSWORD RESET (dev: no mailer configured) ==========\n' +
        `  to:   ${to}\n` +
        `  link: ${link}\n` +
        '================================================================\n'
    );
  }
  return sent;
}
