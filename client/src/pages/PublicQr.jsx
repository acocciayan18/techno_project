import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { AlertTriangle, HelpCircle, PackageOpen, Ban, NotebookPen, CheckCircle2, PartyPopper, Clock, Copy, Check, Tag } from 'lucide-react';
import { api } from '../lib/api.js';
import { useResource } from '../store/dataStore.js';
import ItemPageTemplate from '../components/ItemPageTemplate.jsx';
import { CenterSpinner } from '../components/Spinner.jsx';
import { tapProps } from '../components/motion.jsx';

// Full-width, themed shell for every public finder view. Brings its own header
// (brand + light/dark toggle) and footer since /q/ pages render without the app
// chrome. Content spans the viewport; inner views cap their own reading width.
function PublicShell({ children }) {
  return (
    <div className="min-h-screen flex flex-col bg-bg text-ink">
      <main className="flex-1 flex flex-col">{children}</main>
    </div>
  );
}

function Notice({ icon: IconCmp, iconClass = 'text-muted', title, text }) {
  return (
    <PublicShell>
      <div className="flex-1 flex items-center justify-center px-4 py-16">
        <div className="w-full max-w-[460px] bg-card border border-border rounded-lg px-6 py-12 text-center shadow-brutal-lg">
          <motion.div
            className="flex justify-center mb-4"
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 300, damping: 18 }}
          >
            <IconCmp size={56} strokeWidth={2} className={iconClass} />
          </motion.div>
          <h1 className="text-[1.5rem] break-words">{title}</h1>
          {text && <p className="text-muted mt-2 break-words">{text}</p>}
        </div>
      </div>
    </PublicShell>
  );
}

// Shown when a finder scans a QR that is still AVAILABLE (never claimed). The id
// is deliberately NOT printed on the sticker, so revealing it here , with a copy
// button , is how the rightful owner gets it into the Activate page. A claimed /
// pending / disabled QR never reaches this view (the backend gates `claimable`).
function UnclaimedNotice({ qrId }) {
  const [copied, setCopied] = useState(false);
  async function copyId() {
    try {
      await navigator.clipboard.writeText(qrId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked (insecure context / denied): the id stays selectable below.
    }
  }
  return (
    <PublicShell>
      <div className="flex-1 flex items-center justify-center px-4 py-16">
        <div className="w-full max-w-[460px] bg-card border border-border rounded-lg px-6 py-10 text-center shadow-brutal-lg">
          <motion.div
            className="flex justify-center mb-4"
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 300, damping: 18 }}
          >
            <PackageOpen size={56} strokeWidth={2} className="text-primary" />
          </motion.div>
          <h1 className="text-[1.5rem] break-words">This tag isn’t activated yet</h1>
          <p className="text-muted mt-2 break-words">
            If this QR is yours, copy its ID below and enter it on the Activate page in your TagBack dashboard.
          </p>

          <div className="mt-5 flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
            <code className="flex-1 font-mono font-semibold text-[1.05rem] tracking-wide bg-surface border border-border rounded-sm px-3 py-2.5 select-all break-all">
              {qrId}
            </code>
            <motion.button
              type="button"
              className="btn btn-sm flex-none justify-center"
              onClick={copyId}
              {...tapProps}
            >
              {copied ? <Check size={16} strokeWidth={2.5} /> : <Copy size={16} strokeWidth={2.5} />}
              {copied ? 'Copied' : 'Copy ID'}
            </motion.button>
          </div>

          <Link className="btn btn-primary w-full justify-center mt-4" to={`/activate?qr=${encodeURIComponent(qrId)}`}>
            <Tag size={18} strokeWidth={2.5} /> Activate this QR
          </Link>
        </div>
      </div>
    </PublicShell>
  );
}

export default function PublicQr() {
  const { qrId } = useParams();
  const { data, error, loading, reload } = useResource(`public/${qrId}`, () => api.get(`/q/${qrId}`, { auth: false }));

  // Finders are anonymous, so this page has no SSE stream. Poll while it's open so
  // an owner marking the item found/lost, or editing its info, reaches the finder
  // without a manual reload. The SWR cache keeps the current view visible during
  // each background refetch (no flicker). ~15s staleness is acceptable here.
  useEffect(() => {
    const id = setInterval(reload, 15000);
    return () => clearInterval(id);
    // reload is recreated each render; key the effect on qrId so one timer runs per page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qrId]);

  if (error && !data) return <Notice icon={AlertTriangle} iconClass="text-danger" title="Something went wrong" text={error} />;
  if (loading && !data) return (
    <PublicShell><div className="flex-1 grid place-items-center py-24"><CenterSpinner label="" /></div></PublicShell>
  );

  switch (data.state) {
    case 'NOT_FOUND':
      return <Notice icon={HelpCircle} title="Unknown QR code" text="This code is not in our system." />;
    case 'NOT_ACTIVATED':
      // claimable = AVAILABLE: reveal the id + copy button so the owner can activate.
      // Otherwise a claim is already pending , don't present it as claimable.
      return data.claimable
        ? <UnclaimedNotice qrId={data.qrId || qrId} />
        : <Notice icon={Clock} iconClass="text-warn" title="Activation pending" text="Someone has already requested this QR code. It can’t be claimed until that request is resolved." />;
    case 'DISABLED':
      return <Notice icon={Ban} iconClass="text-danger" title="QR code disabled" text="This code is no longer active." />;
    case 'NO_ITEM':
      return <Notice icon={NotebookPen} title="No item registered" text="This QR is activated but has no item details yet." />;
    case 'REGISTERED_NOT_LOST':
      return <Notice icon={CheckCircle2} iconClass="text-primary" title="Item registered" text="This item is registered with TagBack. It is not currently reported lost." />;
    case 'RECOVERED':
      return <Notice icon={PartyPopper} iconClass="text-primary" title="This item has been recovered" text={`"${data.item?.name || 'The item'}" is no longer reported lost.`} />;
    case 'LOST':
      return (
        <PublicShell>
          <ItemPageTemplate
            qrId={data.qrId || qrId}
            customization={data.customization}
            item={data.item}
            contact={data.contact || {}}
            lost
          />
        </PublicShell>
      );
    case 'PUBLIC_INFO':
      // Owner opted to always show info: full details + contact, no "lost" banner.
      return (
        <PublicShell>
          <ItemPageTemplate
            customization={data.customization}
            item={data.item}
            contact={data.contact || {}}
            showContact
          />
        </PublicShell>
      );
    default:
      return <Notice icon={HelpCircle} title="Unavailable" />;
  }
}
