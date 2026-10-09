import { Link } from 'react-router-dom';
import { QrCode, ArrowLeft } from 'lucide-react';
import { LEGAL_EFFECTIVE_DATE, LEGAL_VERSION } from '../../lib/legal.js';

// Self-contained shell for the standalone legal pages (Terms, Privacy). These
// routes render "bare" (no app chrome, see App.jsx), so each page brings its own
// header, footer and reading-width container and works signed-in or signed-out.
export default function LegalLayout({ title, subtitle, children, crossLink }) {
  return (
    <div className="min-h-screen flex flex-col bg-bg text-ink">
      <header className="sticky top-0 z-20 border-b border-border bg-bg/80 backdrop-blur-md">
        <div className="w-full max-w-3xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5 text-ink hover:no-underline">
            <span className="flex-none w-9 h-9 grid place-items-center bg-primary text-white rounded-[10px] shadow-brutal-sm">
              <QrCode size={19} strokeWidth={2} />
            </span>
            <strong className="font-display font-bold text-[1.1rem] tracking-tight">TagBack</strong>
          </Link>
        </div>
      </header>

      <main className="flex-1 w-full max-w-3xl mx-auto px-4 sm:px-6 py-8 md:py-12">
        <Link to="/" className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted hover:text-ink mb-6">
          <ArrowLeft size={16} strokeWidth={2.5} /> Back to app
        </Link>

        <h1 className="font-display font-bold text-[1.9rem] md:text-[2.2rem] tracking-tight">{title}</h1>
        {subtitle && <p className="text-muted mt-2">{subtitle}</p>}
        <p className="text-[.8rem] text-muted-2 mt-3">
          Version {LEGAL_VERSION} · Effective {LEGAL_EFFECTIVE_DATE}
        </p>

        <div className="mt-8 space-y-7">{children}</div>

        {crossLink && (
          <div className="mt-10 pt-6 border-t border-border text-sm">
            See also:{' '}
            <Link to={crossLink.to} className="font-semibold">{crossLink.label}</Link>
          </div>
        )}
      </main>

      <footer className="border-t border-border mt-auto">
        <div className="w-full max-w-3xl mx-auto px-4 sm:px-6 py-3.5 text-[.82rem] text-muted-2 flex flex-wrap items-center justify-between gap-2">
          <span>TagBack — lost &amp; found, handled.</span>
          <nav className="flex items-center gap-4">
            <Link to="/legal/terms" className="hover:text-ink">Terms</Link>
            <Link to="/legal/privacy" className="hover:text-ink">Privacy</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}

// --- Content primitives: keep the long-form copy readable and consistent. ---

export function Section({ n, title, children }) {
  return (
    <section>
      <h2 className="font-display font-bold text-[1.2rem] tracking-tight mb-2.5 scroll-mt-20">
        {n != null && <span className="text-muted-2 font-mono text-[.95rem] mr-2">{n}.</span>}
        {title}
      </h2>
      <div className="space-y-3 text-[.95rem] leading-relaxed text-ink/90">{children}</div>
    </section>
  );
}

export function P({ children }) {
  return <p>{children}</p>;
}

export function Bullets({ items }) {
  return (
    <ul className="list-disc pl-5 space-y-1.5 marker:text-muted-2">
      {items.map((it, i) => (
        <li key={i}>{it}</li>
      ))}
    </ul>
  );
}
