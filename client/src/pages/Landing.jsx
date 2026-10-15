import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  QrCode, ScanLine, Tag, BellRing, ShieldCheck, Palette, PackageSearch,
  Smartphone, ArrowRight, Check, KeyRound, Wallet, Luggage, Laptop, Dog,
  Briefcase,
} from 'lucide-react';
import ThemeToggle from '../components/ThemeToggle.jsx';
import { tapProps } from '../components/motion.jsx';
import { useShowOnScroll } from '../lib/useScrollDirection.js';

const BrandMark = ({ size = 34, icon = 19 }) => (
  <span
    className="flex-none grid place-items-center bg-primary text-white rounded-[10px] shadow-brutal-sm"
    style={{ width: size, height: size }}
    aria-hidden="true"
  >
    <QrCode size={icon} strokeWidth={2} />
  </span>
);

// Scroll-reveal wrapper — subtle fade + rise, fires once when it enters view.
// Reduced-motion users get the final state immediately (duration collapses via CSS,
// and motion respects prefers-reduced-motion for whileInView transitions).
function Reveal({ children, delay = 0, y = 16, className }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.5, ease: [0.2, 0.8, 0.2, 1], delay }}
    >
      {children}
    </motion.div>
  );
}

const NAV_LINKS = [
  { href: '#how', label: 'How it works' },
  { href: '#benefits', label: 'Benefits' },
  { href: '#use-cases', label: 'Use cases' },
];

function Header() {
  const show = useShowOnScroll();
  return (
    <header className={`sticky top-0 z-50 border-b border-border bg-bg/80 backdrop-blur-lg transition-transform duration-300 ease-out will-change-transform ${show ? 'translate-y-0' : '-translate-y-full'}`}>
      <div className="w-full max-w-app mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
        <Link to="/" className="flex items-center gap-2.5 text-ink hover:no-underline flex-none">
          <BrandMark />
          <strong className="font-display font-bold text-[1.1rem] tracking-tight">TagBack</strong>
        </Link>

        <nav className="hidden md:flex items-center gap-1" aria-label="Page sections">
          {NAV_LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="px-3 py-2 rounded-xs text-sm font-semibold text-muted hover:text-ink hover:bg-surface hover:no-underline transition-colors"
            >
              {l.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2 flex-none">
          <ThemeToggle variant="icon" />
          <Link to="/login" className="btn btn-sm">Sign in</Link>
          <Link to="/register" className="btn btn-primary btn-sm">Get started</Link>
        </div>
      </div>
    </header>
  );
}

// Decorative, non-interactive mock of a TagBack finder page — the view a finder
// sees after scanning a tag. Pure presentation; aria-hidden so it's skipped by AT.
function HeroVisual() {
  return (
    <div className="relative mx-auto w-full max-w-[380px]" aria-hidden="true">
      {/* soft glow behind the card */}
      <div className="absolute -inset-6 bg-primary/10 blur-3xl rounded-full" />

      <motion.div
        className="relative bg-card border border-border rounded-lg shadow-brutal-lg overflow-hidden"
        initial={{ opacity: 0, y: 20, rotate: -1 }}
        animate={{ opacity: 1, y: 0, rotate: 0 }}
        transition={{ duration: 0.6, ease: [0.2, 0.8, 0.2, 1] }}
      >
        <div className="bg-primary text-primary-ink px-5 py-4 flex items-center gap-2.5">
          <ScanLine size={18} strokeWidth={2.5} />
          <span className="font-display font-bold text-[.95rem]">This item is reported lost</span>
        </div>
        <div className="p-5">
          <span className="chip-gold">Keys</span>
          <h3 className="font-display font-bold text-[1.2rem] mt-2 mb-1 !m-0 text-ink leading-tight">
            Front door &amp; car keys
          </h3>
          <p className="text-sm text-muted leading-relaxed mt-1.5">
            “Thanks for finding these! Please reach out and I’ll arrange to collect them. Reward offered.”
          </p>
          <div className="mt-4 flex items-center gap-3">
            <span className="flex-none w-11 h-11 grid place-items-center bg-accent-weak text-primary rounded-sm">
              <QrCode size={22} strokeWidth={2} />
            </span>
            <button type="button" tabIndex={-1} className="btn btn-primary flex-1 pointer-events-none">
              Contact owner
            </button>
          </div>
        </div>
      </motion.div>

      {/* floating tag badge */}
      <motion.div
        className="absolute -top-4 -right-3 sm:-right-5 bg-card border border-border-strong rounded-sm shadow-brutal px-3 py-2 flex items-center gap-2"
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.35, type: 'spring', stiffness: 300, damping: 18 }}
      >
        <span className="w-7 h-7 grid place-items-center bg-success-weak text-success rounded-xs">
          <Check size={16} strokeWidth={3} />
        </span>
        <span className="text-[.72rem] font-bold text-ink leading-tight">Owner notified</span>
      </motion.div>

      {/* floating QR tag chip */}
      <motion.div
        className="absolute -bottom-5 -left-3 sm:-left-6 bg-ink text-bg rounded-sm shadow-brutal px-3.5 py-2.5 flex items-center gap-2.5"
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.5, type: 'spring', stiffness: 300, damping: 18 }}
      >
        <Tag size={18} strokeWidth={2.5} />
        <span className="text-[.72rem] font-bold leading-tight">Scan to return</span>
      </motion.div>
    </div>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden">
      {/* backdrop accents */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-24 -left-24 w-80 h-80 bg-primary/10 blur-3xl rounded-full" />
        <div className="absolute top-20 right-0 w-72 h-72 bg-accent-weak/60 blur-3xl rounded-full" />
      </div>

      <div className="w-full max-w-app mx-auto px-4 sm:px-6 py-10 md:py-16 grid md:grid-cols-2 gap-10 items-center">
        <div>
          <Reveal>
            <span className="inline-flex items-center gap-1.5 badge badge-blue mb-5">
              <Sparkle /> QR-powered lost &amp; found
            </span>
          </Reveal>
          <Reveal delay={0.05}>
            <h1 className="font-display font-bold tracking-tight leading-[1.05] text-[2.4rem] sm:text-[3rem] md:text-[3.4rem]">
              Lose it. Scan it.{' '}
              <span className="text-primary">Get it back.</span>
            </h1>
          </Reveal>
          <Reveal delay={0.1}>
            <p className="text-muted text-[1.05rem] md:text-[1.15rem] leading-relaxed mt-5 max-w-[32rem]">
              Attach a TagBack QR code to anything you own. If it’s ever lost, whoever
              finds it just scans the tag — and gets in touch with you in seconds, without
              ever seeing your private details.
            </p>
          </Reveal>
          <Reveal delay={0.15}>
            <div className="flex flex-row flex-wrap gap-3 mt-6">
              <motion.div {...tapProps} className="inline-flex">
                <Link to="/register" className="btn btn-primary btn-lg">
                  Get started <ArrowRight size={18} strokeWidth={2.5} />
                </Link>
              </motion.div>
              <motion.div {...tapProps} className="inline-flex">
                <Link to="/login" className="btn btn-lg">
                  Sign in
                </Link>
              </motion.div>
            </div>
          </Reveal>
          <Reveal delay={0.2}>
            <ul className="flex flex-wrap gap-x-5 gap-y-2 mt-7 text-sm font-semibold text-muted">
              {['No app required', 'Privacy-first contact', 'Reusable tags'].map((t) => (
                <li key={t} className="inline-flex items-center gap-1.5">
                  <span className="w-4 h-4 grid place-items-center rounded-full bg-success-weak text-success">
                    <Check size={11} strokeWidth={3.5} />
                  </span>
                  {t}
                </li>
              ))}
            </ul>
          </Reveal>
        </div>

        <Reveal delay={0.1} y={0} className="order-first md:order-none">
          <HeroVisual />
        </Reveal>
      </div>
    </section>
  );
}

// tiny inline sparkle so the eyebrow has a mark without another import weight
function Sparkle() {
  return <QrCode size={13} strokeWidth={2.5} />;
}

const STEPS = [
  { icon: Tag, title: 'Attach the QR tag', text: 'Stick or clip a durable TagBack code onto your keys, bag, laptop — anything worth keeping.' },
  { icon: QrCode, title: 'Register your item', text: 'Activate the tag in your account and add item details and a message for finders.' },
  { icon: ScanLine, title: 'A finder scans it', text: 'Lost it? Whoever finds your item scans the QR with any phone camera — no app, no sign-up.' },
  { icon: BellRing, title: 'You get contacted', text: 'They reach you through a private, secure channel. Your real contact details stay hidden.' },
];

function HowItWorks() {
  return (
    <section id="how" className="scroll-mt-20 border-t border-border bg-surface/40">
      <div className="w-full max-w-app mx-auto px-4 sm:px-6 py-12 md:py-16">
        <Reveal className="text-center max-w-2xl mx-auto">
          <h2 className="font-display font-bold tracking-tight text-[1.9rem] md:text-[2.3rem]">
            How TagBack works
          </h2>
          <p className="text-muted mt-3 text-[1.02rem]">
            Four simple steps from tagging an item to getting it safely back in your hands.
          </p>
        </Reveal>

        <div className="relative mt-9 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {/* connecting line on desktop */}
          <div className="hidden lg:block absolute top-9 left-0 right-0 h-px bg-border -z-0" aria-hidden="true" />
          {STEPS.map((s, i) => (
            <Reveal key={s.title} delay={i * 0.08}>
              <div className="relative h-full card !mb-0 flex flex-col">
                <div className="flex items-center justify-between mb-4">
                  <span className="flex-none w-[46px] h-[46px] grid place-items-center bg-primary text-primary-ink rounded-sm shadow-brutal-sm">
                    <s.icon size={22} strokeWidth={2} />
                  </span>
                  <span className="font-display font-bold text-[2rem] leading-none text-border-strong tabular-nums">
                    {i + 1}
                  </span>
                </div>
                <h3 className="font-display font-semibold text-[1.05rem] !mt-0 mb-1.5 text-ink">{s.title}</h3>
                <p className="text-sm text-muted leading-relaxed">{s.text}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

const BENEFITS = [
  { icon: ShieldCheck, title: 'Privacy by default', text: 'Finders contact you through TagBack — your phone number, email and address are never exposed on the tag.' },
  { icon: PackageSearch, title: 'Faster recovery', text: 'A clear, scannable tag turns an honest finder into a quick return instead of a trip to lost-and-found.' },
  { icon: Palette, title: 'Customizable item pages', text: 'Add a name, photo and a personal message — even offer a reward — on each item’s QR page.' },
  { icon: Smartphone, title: 'No app for finders', text: 'Any modern phone camera opens the item page. Nothing to download, nothing to install.' },
  { icon: BellRing, title: 'Instant notifications', text: 'The moment someone scans a lost item, you’re alerted so you can respond right away.' },
  { icon: Tag, title: 'One tag, reusable', text: 'Mark an item recovered and the tag resets — reactivate or move it to something new anytime.' },
];

function Benefits() {
  return (
    <section id="benefits" className="scroll-mt-20">
      <div className="w-full max-w-app mx-auto px-4 sm:px-6 py-12 md:py-16">
        <Reveal className="max-w-2xl">
          <span className="badge badge-blue mb-4">Why TagBack</span>
          <h2 className="font-display font-bold tracking-tight text-[1.9rem] md:text-[2.3rem]">
            Built to get your things home
          </h2>
          <p className="text-muted mt-3 text-[1.02rem]">
            Everything you need to recover a lost item quickly — while keeping your personal
            information firmly in your control.
          </p>
        </Reveal>

        <div className="mt-9 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {BENEFITS.map((b, i) => (
            <Reveal key={b.title} delay={(i % 3) * 0.06}>
              <div className="h-full card !mb-0">
                <span className="flex-none w-11 h-11 grid place-items-center bg-accent-weak text-primary rounded-sm mb-4">
                  <b.icon size={22} strokeWidth={2} />
                </span>
                <h3 className="font-display font-semibold text-[1.05rem] !mt-0 mb-1.5 text-ink">{b.title}</h3>
                <p className="text-sm text-muted leading-relaxed">{b.text}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

const USE_CASES = [
  { icon: KeyRound, label: 'Keys' },
  { icon: Wallet, label: 'Wallets' },
  { icon: Luggage, label: 'Luggage' },
  { icon: Laptop, label: 'Laptops' },
  { icon: Briefcase, label: 'Bags' },
  { icon: Dog, label: 'Pet collars' },
];

function UseCases() {
  return (
    <section id="use-cases" className="scroll-mt-20 border-t border-border bg-surface/40">
      <div className="w-full max-w-app mx-auto px-4 sm:px-6 py-12 md:py-16">
        <Reveal className="text-center max-w-2xl mx-auto">
          <h2 className="font-display font-bold tracking-tight text-[1.9rem] md:text-[2.3rem]">
            Tag anything worth keeping
          </h2>
          <p className="text-muted mt-3 text-[1.02rem]">
            From everyday essentials to the gear you can’t afford to lose — if it can carry a
            tag, TagBack can bring it home.
          </p>
        </Reveal>

        <div className="mt-9 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          {USE_CASES.map((u, i) => (
            <Reveal key={u.label} delay={(i % 6) * 0.05}>
              <div className="h-full bg-card border border-border rounded shadow-brutal-sm px-4 py-6 flex flex-col items-center justify-center gap-3 text-center transition-transform hover:-translate-y-0.5">
                <span className="w-12 h-12 grid place-items-center bg-accent-weak text-primary rounded-sm">
                  <u.icon size={24} strokeWidth={2} />
                </span>
                <span className="font-semibold text-sm text-ink">{u.label}</span>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function CtaBand() {
  return (
    <section className="scroll-mt-20">
      <div className="w-full max-w-app mx-auto px-4 sm:px-6 py-12 md:py-14">
        <Reveal>
          <div className="relative overflow-hidden bg-primary text-primary-ink rounded-lg shadow-brutal-lg px-6 py-10 md:px-12 md:py-14 text-center">
            <div className="pointer-events-none absolute -top-16 -right-10 w-64 h-64 bg-white/10 blur-3xl rounded-full" aria-hidden="true" />
            <div className="pointer-events-none absolute -bottom-20 -left-10 w-64 h-64 bg-black/10 blur-3xl rounded-full" aria-hidden="true" />
            <h2 className="relative font-display font-bold tracking-tight text-[1.8rem] md:text-[2.4rem] text-primary-ink">
              Ready to never lose track again?
            </h2>
            <p className="relative text-primary-ink/85 mt-3 text-[1.05rem] max-w-xl mx-auto">
              Create your free account, activate your first tag, and give every item a way home.
            </p>
            <div className="relative flex flex-col sm:flex-row gap-3 justify-center mt-8">
              <motion.div {...tapProps} className="inline-flex">
                <Link
                  to="/register"
                  className="btn btn-lg w-full sm:w-auto bg-card text-ink border-transparent"
                >
                  Get started <ArrowRight size={18} strokeWidth={2.5} />
                </Link>
              </motion.div>
              <motion.div {...tapProps} className="inline-flex">
                <Link
                  to="/login"
                  className="btn btn-lg w-full sm:w-auto bg-transparent text-primary-ink border-primary-ink/40 shadow-none hover:bg-white/10"
                >
                  Sign in
                </Link>
              </motion.div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-border bg-bg">
      <div className="w-full max-w-app mx-auto px-4 sm:px-6 py-10">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          <div className="sm:col-span-2 lg:col-span-2">
            <Link to="/" className="flex items-center gap-2.5 text-ink hover:no-underline w-fit">
              <BrandMark />
              <strong className="font-display font-bold text-[1.1rem] tracking-tight">TagBack</strong>
            </Link>
            <p className="text-sm text-muted mt-3 max-w-xs leading-relaxed">
              QR-based lost &amp; found. Tag your things, recover them fast, and keep your
              contact details private.
            </p>
          </div>

          <div>
            <h3 className="!mt-0 mb-3 text-[.72rem] font-bold uppercase tracking-wider text-muted-2">Product</h3>
            <ul className="space-y-2 text-sm">
              <li><a href="#how" className="text-muted hover:text-ink font-semibold">How it works</a></li>
              <li><a href="#benefits" className="text-muted hover:text-ink font-semibold">Benefits</a></li>
              <li><a href="#use-cases" className="text-muted hover:text-ink font-semibold">Use cases</a></li>
            </ul>
          </div>

          <div>
            <h3 className="!mt-0 mb-3 text-[.72rem] font-bold uppercase tracking-wider text-muted-2">Get started</h3>
            <ul className="space-y-2 text-sm">
              <li><Link to="/register" className="text-muted hover:text-ink font-semibold">Create account</Link></li>
              <li><Link to="/login" className="text-muted hover:text-ink font-semibold">Sign in</Link></li>
              <li><Link to="/legal/terms" className="text-muted hover:text-ink font-semibold">Terms of Service</Link></li>
              <li><Link to="/legal/privacy" className="text-muted hover:text-ink font-semibold">Privacy Policy</Link></li>
            </ul>
          </div>
        </div>

        <div className="mt-8 pt-6 border-t border-border flex flex-col sm:flex-row items-center justify-between gap-3 text-[.82rem] text-muted-2">
          <span>© {new Date().getFullYear()} TagBack — lost &amp; found, handled.</span>
          <nav className="flex items-center gap-4">
            <Link to="/legal/terms" className="hover:text-ink">Terms</Link>
            <Link to="/legal/privacy" className="hover:text-ink">Privacy</Link>
          </nav>
        </div>
      </div>
    </footer>
  );
}

// Public marketing landing page. Renders "bare" (no app chrome — see Chrome in
// App.jsx) and brings its own header + footer. Signed-in visitors are redirected
// to the dashboard before this mounts, so every CTA here targets the signed-out
// flow (/register, /login) and the standalone legal routes.
export default function Landing() {
  return (
    <div className="min-h-screen flex flex-col bg-bg text-ink">
      <Header />
      <main className="flex-1">
        <Hero />
        <HowItWorks />
        <Benefits />
        <UseCases />
        <CtaBand />
      </main>
      <Footer />
    </div>
  );
}
