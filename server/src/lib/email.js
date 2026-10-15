// Email canonicalization for duplicate-account detection.
//
// Two different-looking addresses can deliver to the SAME inbox, which is how one
// person spins up many "distinct" accounts. We fold those aliases to a single
// canonical form used ONLY for uniqueness checks — the user's real address is
// still stored verbatim (lowercased) for display and for sending the reset email.
//
//   - Sub-addressing (`user+anything@`) is dropped — the `+tag` is a per-message
//     label, not a separate mailbox, on Gmail and most modern providers.
//   - Gmail (and its googlemail.com alias) ignores dots in the local part, so
//     `j.doe@gmail.com` and `jdoe@gmail.com` are the same inbox.
//
// Deliberately conservative: it never merges addresses that could be genuinely
// different people, so it won't lock a legitimate user out of signing up.
export function canonicalizeEmail(raw) {
  const email = String(raw || '').trim().toLowerCase();
  if (!email || email.indexOf('@') === -1) return null;
  let [local, domain] = email.split('@');
  if (!local || !domain) return null;
  local = local.split('+')[0]; // strip sub-address tag
  if (domain === 'googlemail.com') domain = 'gmail.com';
  if (domain === 'gmail.com') local = local.replace(/\./g, '');
  if (!local) return null;
  return `${local}@${domain}`;
}
