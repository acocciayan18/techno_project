import { useState } from 'react';
import { motion } from 'framer-motion';
import { AlertCircle, ShieldCheck, Hand, CheckCircle2, ArrowDown, PackageCheck, Star } from 'lucide-react';
import { getContactType, contactHref, contactDisplay } from '../lib/contactTypes.jsx';
import { api } from '../lib/api.js';
import { assetUrl } from '../lib/config.js';
import { useConfirm } from './ConfirmDialog.jsx';
import { notify } from '../lib/toast.jsx';
import Spinner from './Spinner.jsx';
import { tapProps } from './motion.jsx';

// Full-width public finder layout used by PublicQr (LOST state). Themed with the
// app's light/dark tokens; the owner's accent still drives the title, CTA and
// highlights. Two columns on desktop (sticky photo + details), one on mobile.
//
// Props:
//   customization: { template, accentColor, logoUrl, pageTitle, finderMessage, contactButtonText }
//   item: { name, description, category, recoveryInstructions, photoUrl }
//   contact: { fields: [{ type, value }], preferredMethod }   (already privacy-filtered by the server)
//   lost: boolean   (show the amber "reported lost" status + finder message)
//   showContact: boolean   (render the contact block; defaults to `lost`, but an
//     owner with "Always show information" on sees it while not lost too)

const group = { animate: { transition: { staggerChildren: 0.06, delayChildren: 0.04 } } };
const rise = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.3, ease: [0.2, 0.8, 0.2, 1] } },
};

export default function ItemPageTemplate({ qrId, customization = {}, item = {}, contact = {}, lost = false, showContact = lost }) {
  const c = customization;
  const accent = c.accentColor || '#3457d5';

  const contactFields = (contact && contact.fields) || [];
  const hasContact = contactFields.length > 0;
  const contactRowClass =
    'flex items-center gap-3 bg-card text-ink border border-border rounded-sm px-4 py-3.5 text-left font-semibold ' +
    'shadow-brutal-sm transition-transform hover:-translate-y-0.5 hover:bg-surface hover:no-underline';

  return (
    <div className="w-full max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-4 ">
      <motion.div
        variants={group}
        initial="initial"
        animate="animate"
        className="grid lg:grid-cols-2 gap-8 lg:gap-14 items-start"
      >
        {/* Media column */}
        <motion.div variants={rise} className="lg:sticky lg:top-24">
          {item.photoUrl ? (
            <div className="relative rounded-lg overflow-hidden border border-border bg-surface shadow-brutal">
              <img
                className="w-full object-cover block aspect-square sm:aspect-[4/3] lg:aspect-square"
                src={assetUrl(item.photoUrl)}
                alt={item.name || 'Item'}
              />
            </div>
          ) : (
            <div className="w-full aspect-[4/3] rounded-lg bg-surface border border-border shadow-brutal flex items-center justify-center text-muted-2 text-[.9rem] font-medium">
              No photo provided
            </div>
          )}
        </motion.div>

        {/* Details column */}
        <div className="flex flex-col">
          {lost && (
            <motion.div variants={rise}>
              <span className="inline-flex items-center gap-2.5 bg-warn text-white font-bold uppercase tracking-wide text-[.78rem] px-4 py-2 rounded-full shadow-brutal-sm">
                <AlertCircle size={16} strokeWidth={2.6} />
                Reported lost
              </span>
            </motion.div>
          )}

          {(c.logoUrl || c.pageTitle) && (
            <motion.div variants={rise} className="flex items-center gap-3 mt-5">
              {c.logoUrl && (
                <img
                  className="w-11 h-11 object-cover rounded-sm border border-border shadow-brutal-sm flex-none"
                  src={assetUrl(c.logoUrl)}
                  alt=""
                />
              )}
              {c.pageTitle && (
                <span className="font-display font-bold text-[1.05rem] min-w-0 break-words" style={{ color: accent }}>
                  {c.pageTitle}
                </span>
              )}
            </motion.div>
          )}

          <motion.h1
            variants={rise}
            className="font-display text-[2rem] sm:text-[2.4rem] leading-[1.05] font-bold tracking-tight mt-4 break-words"
          >
            {item.name || 'Unnamed item'}
          </motion.h1>

          {item.description && (
            <motion.p variants={rise} className="mt-4 text-muted text-[1.02rem] leading-relaxed max-w-prose break-words whitespace-pre-wrap">
              {item.description}
            </motion.p>
          )}

          {item.recoveryInstructions && (
            <motion.div
              variants={rise}
              className="mt-5 rounded-sm border border-border bg-surface/60 px-4 py-3.5"
            >
              <h2 className="flex items-center gap-2 font-display font-bold text-[1rem] m-0 break-words">
                <PackageCheck size={18} strokeWidth={2.4} style={{ color: accent }} className="flex-none" />
                How to return it
              </h2>
              <p className="text-ink text-[.95rem] leading-relaxed mt-1.5 mb-0 break-words whitespace-pre-wrap">
                {item.recoveryInstructions}
              </p>
            </motion.div>
          )}

          {lost && c.finderMessage && (
            <motion.blockquote
              variants={rise}
              className="italic rounded-sm px-5 py-4 mt-6 text-ink break-words whitespace-pre-wrap"
              style={{ background: `${accent}12`, borderLeft: `4px solid ${accent}` }}
            >
              “{c.finderMessage}”
            </motion.blockquote>
          )}

          {lost && qrId && (
            <motion.div variants={rise} className="mt-6">
              <FoundReport qrId={qrId} itemName={item.name} accent={accent} hasContact={hasContact} />
            </motion.div>
          )}

          {showContact && (
            <>
              {hasContact ? (
                <motion.div variants={rise} className="mt-7">
                  <h2 className="font-display font-bold text-[1.15rem] mb-1 break-words">
                    {c.contactButtonText || 'Contact the owner'}
                  </h2>
                  <p className="text-muted text-[.88rem] mb-3.5">
                    Found this item? Reach the owner directly using the details below.
                  </p>
                  {contact.preferredMethod && (
                    <div className="flex flex-wrap gap-2 mb-3.5">
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface/70 px-3 py-1.5 text-[.82rem] font-semibold">
                        <Star size={14} strokeWidth={2.4} style={{ color: accent }} className="flex-none" />
                        Prefers {getContactType(contact.preferredMethod).label}
                      </span>
                    </div>
                  )}
                  <div className="grid gap-2.5 sm:grid-cols-2">
                    {contactFields.map((f, i) => {
                      const t = getContactType(f.type);
                      const Icon = t.icon;
                      return (
                        <a
                          key={i}
                          href={contactHref(f)}
                          target="_blank"
                          rel="noreferrer"
                          className={contactRowClass}
                        >
                          <Icon size={18} strokeWidth={2.2} style={{ color: accent }} className="flex-none" />
                          <span className="flex flex-col min-w-0">
                            <span className="text-[.72rem] font-bold uppercase tracking-wide text-muted-2">{t.label}</span>
                            <span className="truncate">{contactDisplay(f)}</span>
                          </span>
                        </a>
                      );
                    })}
                  </div>
                </motion.div>
              ) : (
                <motion.p variants={rise} className="text-muted text-[.9rem] mt-7">
                  The owner has not published contact details for this item yet.
                </motion.p>
              )}
            </>
          )}

          <motion.div
            variants={rise}
            className="flex items-center gap-1.5 mt-8 pt-5 border-t border-border text-muted-2 text-[.82rem] font-medium"
          >
            <ShieldCheck size={14} strokeWidth={2.2} />
            Protected by <span className="font-bold text-muted">TagBack</span>
          </motion.div>
        </div>
      </motion.div>
    </div>
  );
}

// Per-browser guard so a finder who already reported doesn't see the prompt again
// (and can't casually re-fire it). The server de-dupes and rate-limits regardless
// — this is the UX layer. localStorage can be unavailable (private mode); every
// access is guarded so the page still works without it.
const reportKey = (qrId) => `tagback_found_${qrId}`;
function readReported(qrId) {
  try { return localStorage.getItem(reportKey(qrId)) === '1'; } catch { return false; }
}
function writeReported(qrId) {
  try { localStorage.setItem(reportKey(qrId), '1'); } catch { /* ignore */ }
}

// "I found this item" — the finder-facing action on a LOST page. A tap opens a
// confirmation that makes two things explicit before anything is sent: the owner
// is notified, and a report does NOT confirm the item was returned. On confirm it
// posts the report, then switches to a thank-you state that points the finder at
// the owner's own contact details to arrange the actual return.
function FoundReport({ qrId, itemName, accent, hasContact }) {
  const confirm = useConfirm();
  const [reported, setReported] = useState(() => readReported(qrId));
  const [busy, setBusy] = useState(false);

  async function onReport() {
    const ok = await confirm({
      title: 'Report that you found this item?',
      description: (
        <>
          This lets the owner know their item has been spotted — they’ll see it in
          their TagBack dashboard. It <strong>does not</strong> confirm the item has
          been returned.
          {hasContact
            ? ' After reporting, please use the owner’s contact details below to arrange getting it back to them.'
            : ' The owner will need to reach out, or you can check back for contact details.'}
        </>
      ),
      confirmLabel: 'Yes, report it',
      variant: 'default',
      icon: Hand,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await api.post(`/q/${qrId}/found`, {}, { auth: false });
      writeReported(qrId);
      setReported(true);
      notify.success('Thanks — the owner has been notified.');
    } catch (err) {
      notify.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (reported) {
    return (
      <div className="rounded-sm border border-success/40 bg-success-weak/50 px-5 py-4">
        <div className="flex items-start gap-3">
          <CheckCircle2 size={20} strokeWidth={2.4} className="text-success flex-none mt-0.5" />
          <div className="min-w-0">
            <p className="font-semibold text-ink m-0">Thanks for reporting this!</p>
            <p className="text-muted text-[.88rem] mt-1 mb-0">
              The owner has been notified in their dashboard. This doesn’t confirm the
              item was returned —{' '}
              {hasContact ? (
                <>reach out using the contact details below to arrange getting it back.</>
              ) : (
                <>the owner will follow up from here.</>
              )}
            </p>
            {hasContact && (
              <p className="inline-flex items-center gap-1.5 text-[.8rem] font-semibold mt-2 mb-0" style={{ color: accent }}>
                <ArrowDown size={14} strokeWidth={2.6} /> Owner contact details below
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-sm border border-border bg-card shadow-brutal-sm px-5 py-4">
      <h2 className="font-display font-bold text-[1.1rem] m-0 break-words">Found this item?</h2>
      <p className="text-muted text-[.88rem] mt-1 mb-3.5">
        Let the owner know it’s been spotted. Reporting notifies them — it doesn’t
        confirm the item was returned.
      </p>
      <motion.button
        type="button"
        onClick={onReport}
        disabled={busy}
        className="btn btn-lg w-full justify-center text-white shadow-brutal-sm"
        style={{ backgroundColor: accent, borderColor: accent }}
        {...tapProps}
      >
        {busy ? <Spinner size={18} /> : <Hand size={18} strokeWidth={2.4} />}
        {busy ? 'Reporting…' : 'I found this item'}
      </motion.button>
    </div>
  );
}
