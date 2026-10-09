// Outbound mail for password recovery.
//
// Delivery uses Brevo's transactional email HTTP API when configured; otherwise
// a dev fallback logs the reset link to the server console (zero external setup).
// The forgot-password endpoint always responds generically regardless of what
// happens here, so delivery success/failure is never leaked to the caller.
//
// Required env vars to send real mail:
//   BREVO_API_KEY     your Brevo API key (starts with "xkeysib-")
//   SMTP_FROM         a sender address VERIFIED in your Brevo account
//   MAIL_FROM_NAME    optional display name (defaults to APP_NAME)

const APP_NAME = 'TagBack';
const BREVO_ENDPOINT = 'https://api.brevo.com/v3/smtp/email';

async function transport({ to, subject, text }) {
  const apiKey = process.env.BREVO_API_KEY;
  const fromEmail = process.env.SMTP_FROM;

  // Not configured → let the caller fall back to the dev console log.
  if (!apiKey || !fromEmail) return false;

  if (typeof fetch !== 'function') {
    console.error('[mailer] global fetch unavailable — needs Node 18+. Falling back to console log.');
    return false;
  }

  try {
    const res = await fetch(BREVO_ENDPOINT, {
      method: 'POST',
      headers: {
        'api-key': apiKey,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify({
        sender: { email: fromEmail, name: process.env.MAIL_FROM_NAME || APP_NAME },
        to: [{ email: to }],
        subject,
        textContent: text,
      }),
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

export async function sendPasswordReset({ to, link }) {
  const subject = `${APP_NAME} — reset your password`;
  const text =
    `We received a request to reset your ${APP_NAME} password.\n\n` +
    `Reset it here (valid for 1 hour):\n${link}\n\n` +
    `If you didn't request this, you can ignore this email.`;

  const sent = await transport({ to, subject, text });
  if (!sent) {
    // Dev fallback: make the link copy-pasteable from the server log.
    console.log(
      '\n========== PASSWORD RESET (dev: no mailer configured) ==========\n' +
        `  to:   ${to}\n` +
        `  link: ${link}\n` +
        '================================================================\n'
    );
  }
}
