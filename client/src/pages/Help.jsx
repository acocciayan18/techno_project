import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { LifeBuoy, Mail, ChevronRight, Tag, Flag, Eye, Palette, BellRing, FileText, ShieldCheck } from 'lucide-react';
import { tapProps } from '../components/motion.jsx';
import { LEGAL_CONTACT_EMAIL } from '../lib/legal.js';

// Frequently asked questions, grouped to mirror the dashboard's features. Each
// answer is plain copy — kept short so the page stays scannable on mobile.
const FAQS = [
  {
    icon: Tag,
    q: 'How do I activate a QR code?',
    a: 'Open Activate, enter the QR code printed on your sticker and the secret activation code that came with your product. No code? Switch to “I don’t have the code” to request manual admin review.',
  },
  {
    icon: Flag,
    q: 'How do I report an item lost or found?',
    a: 'Open a code and tap “Mark as Lost” — its public finder page goes live so anyone who scans can help return it. When it’s back, tap “Mark as Found”. You can also mark several at once from the dashboard using Select.',
  },
  {
    icon: Eye,
    q: 'Who can see my contact details?',
    a: 'Only the contact fields you switch on are ever shown, and only while an item is reported lost — unless you turn on “Always show information” for that item. Everything else stays private.',
  },
  {
    icon: Palette,
    q: 'Can I customize my public page?',
    a: 'Yes. From Edit item & page you can set a page title, finder message, contact button text and an accent color that drives your public finder page’s look.',
  },
  {
    icon: BellRing,
    q: 'How do I know when someone finds my item?',
    a: 'When a finder taps “I found this item”, you get a notification in the bell (top bar on desktop, dashboard header on mobile) and it appears under Recent activity on your dashboard.',
  },
  {
    icon: Tag,
    q: 'What happens when I delete a QR code?',
    a: 'Your item details, page customization and contact info are removed, and the code returns to unused — you can activate it again later with its printed code. Mark a lost item found before deleting it.',
  },
];

function Faq({ icon: Icon, q, a }) {
  return (
    <details className="group border-b border-border last:border-0">
      <summary className="flex items-center gap-3 py-3.5 cursor-pointer list-none select-none">
        <span className="flex-none w-9 h-9 grid place-items-center rounded-[9px] bg-accent-weak text-primary">
          <Icon size={17} strokeWidth={2} />
        </span>
        <span className="flex-1 min-w-0 font-semibold text-ink text-[.95rem]">{q}</span>
        <ChevronRight size={18} strokeWidth={2.4} className="flex-none text-muted-2 transition-transform group-open:rotate-90" />
      </summary>
      <p className="text-muted text-[.9rem] leading-relaxed pl-12 pr-2 pb-4 mt-0">{a}</p>
    </details>
  );
}

const legalRow =
  'flex items-center gap-3 px-3.5 py-3 border-b border-border last:border-0 hover:bg-surface hover:no-underline transition-colors';

// Signed-in Help & Support page: FAQ + a direct line to support, plus the legal
// links. Reached from the More menu (desktop and mobile).
export default function Help() {
  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <span className="flex-none w-11 h-11 grid place-items-center rounded-[12px] bg-accent-weak text-primary">
          <LifeBuoy size={22} strokeWidth={2} />
        </span>
        <div className="min-w-0">
          <h1 className="m-0">Help &amp; Support</h1>
          <p className="text-muted text-[.95rem] m-0">Answers to common questions, and how to reach us.</p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px] items-start">
        <section className="card">
          <h3 className="mt-0">Frequently asked questions</h3>
          <div>
            {FAQS.map((f) => (
              <Faq key={f.q} {...f} />
            ))}
          </div>
        </section>

        <aside className="flex flex-col gap-4">
          <section className="card bg-surface">
            <h3 className="mt-0 flex items-center gap-2"><Mail size={18} strokeWidth={2.2} className="text-primary" /> Still need help?</h3>
            <p className="text-muted text-[.9rem]">
              Can’t find your answer? Send us the QR code and a short description and we’ll get back to you.
            </p>
            <motion.a
              className="btn btn-primary w-full justify-center"
              href={`mailto:${LEGAL_CONTACT_EMAIL}?subject=${encodeURIComponent('TagBack support request')}`}
              {...tapProps}
            >
              <Mail size={18} strokeWidth={2.5} /> Contact support
            </motion.a>
            <p className="text-muted-2 text-[.8rem] mt-2.5 break-all">{LEGAL_CONTACT_EMAIL}</p>
          </section>

          <section>
            <h3 className="!mt-0 mb-1">Legal</h3>
            <nav className="rounded border border-border bg-card overflow-hidden shadow-brutal-sm">
              <Link to="/legal/terms" className={legalRow}>
                <span className="flex-none w-9 h-9 grid place-items-center rounded-[9px] bg-accent-weak text-primary"><FileText size={17} strokeWidth={2} /></span>
                <span className="flex-1 font-semibold text-ink text-[.92rem]">Terms of Service</span>
                <ChevronRight size={17} strokeWidth={2} className="flex-none text-muted-2" />
              </Link>
              <Link to="/legal/privacy" className={legalRow}>
                <span className="flex-none w-9 h-9 grid place-items-center rounded-[9px] bg-accent-weak text-primary"><ShieldCheck size={17} strokeWidth={2} /></span>
                <span className="flex-1 font-semibold text-ink text-[.92rem]">Privacy Policy</span>
                <ChevronRight size={17} strokeWidth={2} className="flex-none text-muted-2" />
              </Link>
            </nav>
          </section>
        </aside>
      </div>
    </div>
  );
}
