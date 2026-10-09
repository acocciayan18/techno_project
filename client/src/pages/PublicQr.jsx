import { useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { AlertTriangle, HelpCircle, PackageOpen, Ban, NotebookPen, CheckCircle2, PartyPopper } from 'lucide-react';
import { api } from '../lib/api.js';
import { useResource } from '../store/dataStore.js';
import ItemPageTemplate from '../components/ItemPageTemplate.jsx';
import { CenterSpinner } from '../components/Spinner.jsx';

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

export default function PublicQr() {
  const { qrId } = useParams();
  const { data, error, loading } = useResource(`public/${qrId}`, () => api.get(`/q/${qrId}`, { auth: false }));

  if (error && !data) return <Notice icon={AlertTriangle} iconClass="text-danger" title="Something went wrong" text={error} />;
  if (loading && !data) return (
    <PublicShell><div className="flex-1 grid place-items-center py-24"><CenterSpinner label="" /></div></PublicShell>
  );

  switch (data.state) {
    case 'NOT_FOUND':
      return <Notice icon={HelpCircle} title="Unknown QR code" text="This code is not in our system." />;
    case 'NOT_ACTIVATED':
      return <Notice icon={PackageOpen} title="QR code not activated" text="This QR has not been registered to an owner yet." />;
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
