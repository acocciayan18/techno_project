// Branded, email-client-safe templates for transactional mail.
//
// Rules that keep these rendering correctly across Gmail / Outlook / Apple Mail:
//   - table-based layout (flexbox/grid are unreliable in email clients)
//   - inline styles only (most clients strip <style>; a small <style> block is
//     kept purely for a progressive dark-mode nicety and a mobile tweak)
//   - no external CSS/JS/images , the button is a styled <a>, not an image, so it
//     survives image-blocking and never breaks if an asset host is down
//   - every message ships BOTH an HTML part and a plain-text part (built here)
//
// Each builder returns { subject, html, text }. Keep the text part a faithful,
// link-visible version of the HTML so text-only clients and deliverability
// (spam) scoring both stay healthy.

const APP_NAME = 'TagBack';
const BRAND = '#3457D5'; // cobalt , matches the app's --primary
const BRAND_DARK = '#2A47B6'; // --primary-hover
const INK = '#101522';
const MUTED = '#5b6472';
const BORDER = '#e4e7ec';
const CANVAS = '#f5f6f8';

// Escape a string for safe interpolation into HTML (names are user-controlled).
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Shared responsive shell. `preheader` is the hidden inbox-preview snippet.
function shell({ preheader, bodyHtml }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${APP_NAME}</title>
<style>
  @media (max-width:480px){
    .tb-card{padding:28px 22px !important;}
    .tb-btn{display:block !important;text-align:center !important;}
  }
  @media (prefers-color-scheme:dark){
    .tb-bg{background:#0b0d12 !important;}
    .tb-card{background:#151821 !important;border-color:#262a33 !important;}
    .tb-ink{color:#eceff4 !important;}
    .tb-muted{color:#9aa3b2 !important;}
    .tb-divider{border-color:#262a33 !important;}
    .tb-code{background:#0b0d12 !important;color:#eceff4 !important;border-color:#262a33 !important;}
  }
</style>
</head>
<body style="margin:0;padding:0;background:${CANVAS};">
<div class="tb-bg" style="background:${CANVAS};padding:0;margin:0;width:100%;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;height:0;width:0;">${esc(preheader)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${CANVAS};">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:480px;width:100%;">
          <tr>
            <td style="padding:0 4px 20px;">
              <span style="display:inline-block;font:700 20px/1 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${BRAND};letter-spacing:-0.02em;">${APP_NAME}</span>
            </td>
          </tr>
          <tr>
            <td class="tb-card" style="background:#ffffff;border:1px solid ${BORDER};border-radius:14px;padding:36px 32px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
              ${bodyHtml}
            </td>
          </tr>
          <tr>
            <td style="padding:20px 8px 0;">
              <p class="tb-muted" style="margin:0;font:400 12px/1.6 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${MUTED};">
                You received this email because a password reset was requested for your ${APP_NAME} account.
                If it wasn’t you, no action is needed , your password stays unchanged.
              </p>
              <p class="tb-muted" style="margin:10px 0 0;font:400 12px/1.6 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${MUTED};">
                © ${new Date().getFullYear()} ${APP_NAME}
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</div>
</body>
</html>`;
}

// Password-reset email. `link` is the full reset URL; `minutes` is the token TTL;
// `name` is optional (greets the user by first name when known).
export function passwordResetEmail({ link, minutes = 60, name = '' } = {}) {
  const first = String(name || '').trim().split(/\s+/)[0] || '';
  const greeting = first ? `Hi ${esc(first)},` : 'Hi,';
  const window = `${minutes} minute${minutes === 1 ? '' : 's'}`;
  const safeLink = esc(link);

  const subject = `Reset your ${APP_NAME} password`;

  const bodyHtml = `
    <h1 class="tb-ink" style="margin:0 0 14px;font:700 22px/1.3 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${INK};letter-spacing:-0.01em;">Reset your password</h1>
    <p class="tb-ink" style="margin:0 0 10px;font:400 15px/1.6 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${INK};">${greeting}</p>
    <p class="tb-muted" style="margin:0 0 24px;font:400 15px/1.6 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${MUTED};">
      We received a request to reset the password for your ${APP_NAME} account. Tap the button below to choose a new one. This link is valid for <strong style="color:inherit;">${window}</strong> and can be used once.
    </p>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 26px;">
      <tr>
        <td align="center" bgcolor="${BRAND}" style="border-radius:10px;">
          <a class="tb-btn" href="${safeLink}" target="_blank" rel="noopener noreferrer"
             style="display:inline-block;padding:14px 30px;font:600 15px/1 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#ffffff;text-decoration:none;border-radius:10px;background:${BRAND};border:1px solid ${BRAND_DARK};">
            Reset password
          </a>
        </td>
      </tr>
    </table>
    <p class="tb-muted" style="margin:0 0 8px;font:400 13px/1.6 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${MUTED};">
      Or paste this link into your browser:
    </p>
    <p style="margin:0 0 24px;">
      <a class="tb-code" href="${safeLink}" target="_blank" rel="noopener noreferrer"
         style="display:block;word-break:break-all;padding:12px 14px;border:1px solid ${BORDER};border-radius:8px;background:${CANVAS};font:400 12px/1.5 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:${BRAND_DARK};text-decoration:none;">${safeLink}</a>
    </p>
    <hr class="tb-divider" style="border:none;border-top:1px solid ${BORDER};margin:4px 0 18px;">
    <p class="tb-muted" style="margin:0;font:400 13px/1.6 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${MUTED};">
      Didn’t request this? You can safely ignore this email , your password won’t change until you open the link above and set a new one. For your security, never share this link with anyone.
    </p>`;

  const html = shell({
    preheader: `Reset your ${APP_NAME} password , link valid for ${window}.`,
    bodyHtml,
  });

  const text =
    `${first ? `Hi ${first},` : 'Hi,'}\n\n` +
    `We received a request to reset the password for your ${APP_NAME} account.\n\n` +
    `Reset it here (valid for ${window}, usable once):\n${link}\n\n` +
    `Didn't request this? You can safely ignore this email , your password won't ` +
    `change until you open the link above and set a new one. ` +
    `For your security, never share this link with anyone.\n\n` +
    `, ${APP_NAME}`;

  return { subject, html, text };
}

export function verificationEmail({ link, minutes = 60, name = '' } = {}) {
  const first = String(name || '').trim().split(/\s+/)[0] || '';
  const greeting = first ? `Hi ${esc(first)},` : 'Hi,';
  const safeLink = esc(link);
  const window = `${minutes} minute${minutes === 1 ? '' : 's'}`;
  const subject = `Verify your ${APP_NAME} recovery email`;
  const bodyHtml = `<h1 class="tb-ink" style="margin:0 0 14px;font:700 22px/1.3 sans-serif;color:${INK};">Verify your recovery email</h1>
    <p class="tb-ink" style="margin:0 0 10px;color:${INK};">${greeting}</p>
    <p class="tb-muted" style="margin:0 0 24px;color:${MUTED};">Confirm this email address for your ${APP_NAME} account. The link expires in <strong>${window}</strong>.</p>
    <a class="tb-btn" href="${safeLink}" style="display:inline-block;padding:14px 30px;color:#fff;background:${BRAND};border-radius:10px;text-decoration:none;">Verify recovery email</a>
    <p class="tb-muted" style="margin:24px 0 0;color:${MUTED};">If you did not request this change, you can ignore this message.</p>`;
  return { subject, html: shell({ preheader: subject, bodyHtml }), text: `${greeting}\n\nVerify your recovery email:\n${link}\n\nThis link expires in ${window}.` };
}

export function securityNoticeEmail({ name = '', kind = 'password' } = {}) {
  const first = String(name || '').trim().split(/\s+/)[0] || '';
  const subject = `${APP_NAME} security notification`;
  const change = kind === 'email' ? 'recovery email' : 'password';
  const text = `Hi${first ? ` ${first}` : ''},\n\nYour ${change} was changed. If you did not make this change, contact an administrator immediately.\n\n, ${APP_NAME}`;
  const bodyHtml = `<h1 class="tb-ink" style="margin:0 0 14px;font:700 22px/1.3 sans-serif;color:${INK};">Security notification</h1>
    <p class="tb-muted" style="margin:0;color:${MUTED};">${esc(text).replace(/\n/g, '<br>')}</p>`;
  return { subject, html: shell({ preheader: subject, bodyHtml }), text };
}
