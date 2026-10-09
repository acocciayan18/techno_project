import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Tag, QrCode, KeyRound, ShieldQuestion, Clock, ArrowLeft, PackageCheck } from 'lucide-react';
import { api } from '../lib/api.js';
import { tapProps } from '../components/motion.jsx';
import Spinner from '../components/Spinner.jsx';
import CharCount from '../components/CharCount.jsx';
import { LIMITS } from '../lib/limits.js';
import { notify } from '../lib/toast.jsx';

export default function ActivateQr() {
  const navigate = useNavigate();
  const [mode, setMode] = useState('code'); // 'code' = proof of possession, 'request' = admin review
  const [qrId, setQrId] = useState('');
  const [secret, setSecret] = useState('');
  const [note, setNote] = useState('');
  const [requested, setRequested] = useState(false);
  const [busy, setBusy] = useState(false);

  async function activateWithCode(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const { qrId: activated } = await api.post('/owner/qr/activate', { qrId, secret });
      notify.success(`${activated} activated — now register your item.`);
      navigate(`/qr/${activated}/item`, { replace: true });
    } catch (err) {
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
      <div className="flex flex-col-reverse md:flex-row md:justify-between md:items-center gap-3 md:gap-4 mb-[1.1rem]">
        <div>
          <h1>Activate a QR</h1>
          <p className="text-muted text-[.95rem] m-0">Link a QR sticker to your account to start protecting an item.</p>
        </div>
        <Link className="btn btn-ghost btn-sm self-start" to="/dashboard"><ArrowLeft size={16} strokeWidth={2.5} /> Back</Link>
      </div>

      {/* Mode switch: the activation code proves you physically hold the product. */}
      <div className="grid grid-cols-2 gap-[.55rem] mb-4">
        <motion.button
          type="button"
          className={`chip-toggle justify-center text-center ${mode === 'code' ? 'chip-toggle-active' : ''}`}
          onClick={() => setMode('code')}
          whileTap={{ scale: 0.95 }}
        >
          <KeyRound size={15} strokeWidth={2.5} className='mr-2 flex-none' /> I have the activation code
        </motion.button>
        <motion.button
          type="button"
          className={`chip-toggle justify-center text-center ${mode === 'request' ? 'chip-toggle-active' : ''}`}
          onClick={() => setMode('request')}
          whileTap={{ scale: 0.95 }}
        >
          <ShieldQuestion size={15} strokeWidth={2.5} className='mr-2 flex-none' /> I don’t have the code
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
              <form onSubmit={activateWithCode}>
                <label className="field-label">QR code
                  <div className="inp-icon mt-1.5"><QrCode /><input value={qrId} onChange={(e) => setQrId(e.target.value)} placeholder="QR-A7K2P9XQ" maxLength={11} required /></div>
                </label>
                <label className="field-label">Activation code
                  <div className="inp-icon mt-1.5"><KeyRound /><input value={secret} onChange={(e) => setSecret(e.target.value)} placeholder="A2CD-EF34-GH5J-KM" maxLength={20} autoComplete="off" required /></div>
                </label>
                <div className="flex justify-end">
                  <motion.button className="btn btn-primary" disabled={busy} {...tapProps}>
                    {busy ? <Spinner size={18} /> : <Tag size={18} strokeWidth={2.5} />}
                    {busy ? 'Activating…' : 'Activate'}
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
                  <div className="inp-icon mt-1.5"><QrCode /><input value={qrId} onChange={(e) => setQrId(e.target.value)} placeholder="QR-A7K2P9XQ" maxLength={11} required /></div>
                </label>
                <label className="field-label">Note for the admin <span className="text-muted-2 font-normal">(optional)</span>
                  <textarea className="mt-1.5" rows={3} value={note} onChange={(e) => setNote(e.target.value)} maxLength={LIMITS.claimNote} placeholder="Proof of purchase, order number, where you bought it…" />
                  <CharCount value={note} max={LIMITS.claimNote} />
                </label>
                <div className="flex justify-end">
                  <motion.button className="btn btn-primary" disabled={busy} {...tapProps}>
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
            <li>FAsk the admin or seller for the <strong>activation code</strong>.</li>
            <li>Enter both to claim the QR instantly, then register your item.</li>
          </ol>
          <hr className="border-0 border-t border-border my-4" />
          <p className="text-muted-2 text-[.82rem] m-0">
            No code? Use <strong>I don’t have the code</strong> to request manual review — an admin verifies ownership before activating.
          </p>
        </aside>
      </div>
    </div>
  );
}
