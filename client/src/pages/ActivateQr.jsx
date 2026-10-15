import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Tag, QrCode, KeyRound, ShieldQuestion, Clock, ArrowLeft, PackageCheck,
  LifeBuoy, CheckCircle2, XCircle, AlertTriangle, Ban, Loader2,
} from 'lucide-react';
import { api } from '../lib/api.js';
import { tapProps } from '../components/motion.jsx';
import Spinner from '../components/Spinner.jsx';
import CharCount from '../components/CharCount.jsx';
import { LIMITS } from '../lib/limits.js';
import { notify } from '../lib/toast.jsx';

// Activation code = 14 chars from a Crockford-style alphabet (no O/0/I/1/L/U),
// printed grouped 4-4-4-2 as "A2CD-EF34-GH5J-KM" (see server lib/ids.js).
// Keep these mirrored with the server; it re-validates regardless.
const SECRET_ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ';
const SECRET_LEN = 14;
const NON_SECRET_RE = new RegExp(`[^${SECRET_ALPHABET}]`, 'g');

// Strip dashes/spaces/invalid chars, uppercase, cap at 14, then regroup with
// dashes. Works the same whether the user types one char or pastes a full code.
function formatActivationCode(raw) {
  const clean = String(raw).toUpperCase().replace(NON_SECRET_RE, '').slice(0, SECRET_LEN);
  return clean.replace(/(.{4})(?=.)/g, '$1-');
}
const secretCore = (s) => s.replace(/-/g, '');

// QR id = "QR-" + 8 chars of A-Z/0-9 (see server lib/ids.js). Mirror the server's
// normalizeQrId: accept the id with or without the prefix, in any case, strip
// anything out-of-alphabet, cap the core at 8, then re-prefix for a canonical
// display. The server re-validates regardless.
const QR_PREFIX = 'QR-';
const QR_CORE_LEN = 8;
function formatQrId(raw) {
  const core = String(raw)
    .toUpperCase()
    .replace(/\s/g, '')
    .replace(/^QR-?/, '') // drop a leading prefix the user typed or pasted
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, QR_CORE_LEN);
  return core ? QR_PREFIX + core : '';
}
const qrCore = (s) => s.replace(/^QR-/, '');

// Map the public /q/:qrId `state` into what the Activate page should tell the
// user *before* they submit. `blocking` means both flows would certainly fail
// (no point sending the request); the server stays authoritative either way.
function describeQrState(data) {
  switch (data.state) {
    case 'NOT_FOUND':
      return { tone: 'red', Icon: XCircle, blocking: true, msg: 'No QR exists with this code — check the printed id.' };
    case 'DISABLED':
      return { tone: 'red', Icon: Ban, blocking: true, msg: 'This QR has been disabled and can’t be activated.' };
    case 'NOT_ACTIVATED':
      return data.claimable
        ? { tone: 'green', Icon: CheckCircle2, blocking: false, msg: 'Unused QR — ready to activate with its code.' }
        : { tone: 'amber', Icon: AlertTriangle, blocking: true, msg: 'A claim is already pending for this QR.' };
    default:
      // Any ACTIVATED state (NO_ITEM / REGISTERED_NOT_LOST / LOST / RECOVERED / PUBLIC_INFO)
      return { tone: 'amber', Icon: AlertTriangle, blocking: true, msg: 'This QR is already activated by an account.' };
  }
}

// Small, focused confirmation modal shown right before a QR is linked to the
// account — reuses the portal + spring pattern from QrPrintDialog.
function ConfirmActivate({ qrId, busy, onConfirm, onCancel }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && !busy && onCancel();
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [busy, onCancel]);

  return createPortal(
    <AnimatePresence>
      <motion.div
        key="confirm-backdrop"
        className="fixed inset-0 z-[80] bg-black/40 backdrop-blur-[2px] grid place-items-center p-4"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        transition={{ duration: 0.16 }}
        onClick={() => !busy && onCancel()}
      >
        <motion.div
          key="confirm-panel"
          className="card w-full max-w-[380px] m-0"
          role="dialog" aria-modal="true" aria-label="Confirm activation"
          initial={{ opacity: 0, y: 16, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 16, scale: 0.98 }}
          transition={{ type: 'spring', stiffness: 400, damping: 32 }}
          onClick={(e) => e.stopPropagation()}
        >
          <span className="w-11 h-11 grid place-items-center rounded-[12px] bg-accent-weak text-primary mb-3"><Tag size={22} strokeWidth={2.2} /></span>
          <h2 className="m-0 text-lg">Activate this QR?</h2>
          <p className="text-muted m-0 mt-1.5">
            <code>{qrId}</code> will be linked to your account. You’ll then register the item it protects.
          </p>
          <div className="flex justify-end gap-2.5 mt-5">
            <motion.button type="button" className="btn" onClick={onCancel} disabled={busy} {...tapProps}>Cancel</motion.button>
            <motion.button type="button" className="btn btn-primary" onClick={onConfirm} disabled={busy} {...tapProps}>
              {busy ? <Spinner size={18} /> : <Tag size={18} strokeWidth={2.5} />}
              {busy ? 'Activating…' : 'Yes, activate'}
            </motion.button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body,
  );
}

export default function ActivateQr() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [mode, setMode] = useState('code'); // 'code' = proof of possession, 'request' = admin review
  // Prefill from the public "not activated" page's Copy-ID → Activate deep link
  // (/activate?qr=QR-XXXX). The user still supplies the secret activation code.
  const [qrId, setQrId] = useState(() => formatQrId(searchParams.get('qr') || ''));
  const [secret, setSecret] = useState('');
  const [note, setNote] = useState('');
  const [requested, setRequested] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);

  // Live QR lookup against the public resolver: once the id is complete we tell
  // the user whether it's real / unused / already taken before they submit.
  // status: null | { loading } | described-state (see describeQrState).
  const [status, setStatus] = useState(null);

  // Validation: complete only at the full length (chars are already constrained
  // to the alphabets by the formatters, so length is the one check).
  const secretComplete = secretCore(secret).length === SECRET_LEN;
  const secretInvalid = secret.length > 0 && !secretComplete;
  const qrComplete = qrCore(qrId).length === QR_CORE_LEN;

  // Debounced verification. Runs whenever a complete id is present; aborts the
  // in-flight lookup if the id changes again. Public endpoint → auth: false.
  useEffect(() => {
    if (!qrComplete) { setStatus(null); return; }
    const ctrl = new AbortController();
    setStatus({ loading: true });
    const t = setTimeout(async () => {
      try {
        const data = await api.get(`/q/${encodeURIComponent(qrId)}`, { auth: false, signal: ctrl.signal });
        setStatus(describeQrState(data));
      } catch (err) {
        if (!err.aborted) setStatus(null); // network hiccup: fall back to server-side check on submit
      }
    }, 400);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [qrId, qrComplete]);

  // Known dead-end (not found / disabled / already taken): block the submit to
  // save a round trip. The server still re-checks everything regardless.
  const blocked = status && !status.loading && status.blocking;

  async function activateWithCode() {
    setBusy(true);
    try {
      const { qrId: activated } = await api.post('/owner/qr/activate', { qrId, secret });
      notify.success(`${activated} activated — now register your item.`);
      navigate(`/qr/${activated}/item`, { replace: true });
    } catch (err) {
      setConfirming(false);
      notify.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function requestAccess(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post('/owner/qr/claim-request', { qrId, note });
      setRequested(true);
    } catch (err) {
      notify.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (requested) {
    return (
      <div>
        <div className="flex flex-col-reverse md:flex-row md:justify-between md:items-center gap-3 md:gap-4 mb-[1.1rem]">
          <h1>Activate a QR</h1>
          <Link className="btn btn-ghost btn-sm self-start" to="/dashboard"><ArrowLeft size={16} strokeWidth={2.5} /> Back</Link>
        </div>
        <div className="card flex flex-col items-center text-center gap-3 py-10">
          <span className="w-12 h-12 grid place-items-center rounded-[12px] bg-info-weak text-info"><Clock size={24} strokeWidth={2} /></span>
          <h2 className="m-0">Request submitted</h2>
          <p className="text-muted m-0 max-w-prose">
            Your request for <code>{qrId}</code> is awaiting admin review. You’ll become its owner once an admin approves it.
          </p>
          <motion.button className="btn btn-primary mt-2" onClick={() => navigate('/dashboard')} {...tapProps}>
            Back to dashboard
          </motion.button>
        </div>
      </div>
    );
  }

  return (
    <div>
      {confirming && (
        <ConfirmActivate
          qrId={qrId}
          busy={busy}
          onConfirm={activateWithCode}
          onCancel={() => !busy && setConfirming(false)}
        />
      )}

      <div className="flex flex-col-reverse md:flex-row md:justify-between md:items-center gap-3 md:gap-4 mb-[1.1rem]">
        <div>
          <h1>Activate a QR</h1>
          <p className="text-muted text-[.95rem] m-0">Link a QR sticker to your account to start protecting an item.</p>
        </div>
        <Link className="btn btn-ghost btn-sm self-start" to="/dashboard"><ArrowLeft size={16} strokeWidth={2.5} /> Back</Link>
      </div>

      {/* Mode switch: the activation code proves you physically hold the product. */}
     
<div className="flex flex-wrap gap-[.55rem] mb-4">
  <motion.button
    type="button"
    className={`chip-toggle w-fit justify-center text-center ${mode === 'code' ? 'chip-toggle-active' : ''}`}
    onClick={() => setMode('code')}
    whileTap={{ scale: 0.95 }}
  >
    <KeyRound size={15} strokeWidth={2.5} className="mr-2 flex-none" /> Have Code
  </motion.button>

  <motion.button
    type="button"
    className={`chip-toggle w-fit justify-center text-center ${mode === 'request' ? 'chip-toggle-active' : ''}`}
    onClick={() => setMode('request')}
    whileTap={{ scale: 0.95 }}
  >
    <ShieldQuestion size={15} strokeWidth={2.5} className="mr-2 flex-none" /> Request Approval
  </motion.button>
</div>


      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-4 items-start">
        {/* Main: the active form */}
        <div className="card">
          {mode === 'code' ? (
            <>
              <h3 className="mt-0">Enter your activation code</h3>
              <p className="text-muted mb-2">
                Enter the code printed on your QR sticker and the secret <strong>activation code</strong> that came
                with your product (under the scratch-off panel / inside the packaging).
              </p>
              <form onSubmit={(e) => { e.preventDefault(); if (qrComplete && secretComplete && !blocked) setConfirming(true); }}>
                <label className="field-label">QR code
                  <div className="inp-icon mt-1.5"><QrCode /><input value={qrId} onChange={(e) => setQrId(formatQrId(e.target.value))} placeholder="QR-A7K2P9XQ" maxLength={11} autoCapitalize="characters" autoComplete="off" spellCheck={false} required /></div>
                  <QrStatus status={status} show={qrComplete} />
                </label>
                <label className="field-label">Activation code
                  <div className="inp-icon mt-1.5"><KeyRound /><input
                    value={secret}
                    onChange={(e) => setSecret(formatActivationCode(e.target.value))}
                    placeholder="A2CD-EF34-GH5J-KM"
                    maxLength={17}
                    autoComplete="off"
                    autoCapitalize="characters"
                    spellCheck={false}
                    inputMode="text"
                    aria-invalid={secretInvalid ? true : undefined}
                    required
                  /></div>
                  {secretInvalid && (
                    <p className="text-danger text-xs mt-1 mb-0">
                      Enter all {SECRET_LEN} characters — {secretCore(secret).length} so far.
                    </p>
                  )}
                </label>
                <div className="flex justify-end">
                  <motion.button className="btn btn-primary" disabled={busy || !secretComplete || !qrComplete || blocked} {...tapProps}>
                    <Tag size={18} strokeWidth={2.5} />
                    Activate
                  </motion.button>
                </div>
              </form>
            </>
          ) : (
            <>
              <h3 className="mt-0">Request admin review</h3>
              <p className="text-muted">
                Lost or damaged activation code? Submit a request and an admin will verify your ownership before
                activating. Entering the QR code alone never grants access.
              </p>
              <form onSubmit={requestAccess}>
                <label className="field-label">QR code
                  <div className="inp-icon mt-1.5"><QrCode /><input value={qrId} onChange={(e) => setQrId(formatQrId(e.target.value))} placeholder="QR-A7K2P9XQ" maxLength={11} autoCapitalize="characters" autoComplete="off" spellCheck={false} required /></div>
                  <QrStatus status={status} show={qrComplete} />
                </label>
                <label className="field-label">Note for the admin <span className="text-muted-2 font-normal">(optional)</span>
                  <textarea className="mt-1.5" rows={3} value={note} onChange={(e) => setNote(e.target.value)} maxLength={LIMITS.claimNote} placeholder="Proof of purchase, order number, where you bought it…" />
                  <CharCount value={note} max={LIMITS.claimNote} />
                </label>
                <div className="flex justify-end">
                  <motion.button className="btn btn-primary" disabled={busy || !qrComplete || blocked} {...tapProps}>
                    {busy ? <Spinner size={18} /> : <ShieldQuestion size={18} strokeWidth={2.5} />}
                    {busy ? 'Submitting…' : 'Request activation'}
                  </motion.button>
                </div>
              </form>
            </>
          )}
        </div>

        {/* Aside: how it works — fills the remaining width, consistent with other pages */}
        <aside className="card bg-surface">
          <h3 className="mt-0 flex items-center gap-2"><PackageCheck size={18} strokeWidth={2.2} className="text-primary" /> How activation works</h3>
          <ol className="text-muted text-[.9rem] leading-relaxed pl-5 m-0 flex flex-col gap-2 list-decimal">
            <li>Find the <strong>QR code</strong> printed on your sticker.</li>
            <li>Ask the admin or seller for the <strong>activation code</strong>.</li>
            <li>Enter both to claim the QR instantly, then register your item.</li>
          </ol>
          <hr className="border-0 border-t border-border my-4" />
          <p className="text-muted-2 text-[.82rem] m-0">
            No code? Use <strong>Request Approval</strong> to request manual review — an admin verifies ownership before activating.
          </p>
          <Link to="/help" className="btn btn-ghost btn-sm mt-3 w-full justify-center">
            <LifeBuoy size={15} strokeWidth={2.5} /> Help &amp; support
          </Link>
        </aside>
      </div>
    </div>
  );
}

// Inline status line under the QR input: a tinted badge once a complete id has
// been resolved against the public endpoint.
function QrStatus({ status, show }) {
  if (!show || !status) return null;
  if (status.loading) {
    return (
      <p className="text-muted-2 text-xs mt-1.5 mb-0 flex items-center gap-1.5">
        <Loader2 size={13} className="animate-spin" /> Checking this QR…
      </p>
    );
  }
  const badge = { green: 'badge-green', amber: 'badge-amber', red: 'badge-red' }[status.tone] || 'badge-gray';
  const { Icon } = status;
  return (
    <span className={`badge ${badge} mt-1.5 !normal-case font-semibold`} style={{ letterSpacing: 0 }}>
      <Icon size={13} strokeWidth={2.5} /> {status.msg}
    </span>
  );
}
