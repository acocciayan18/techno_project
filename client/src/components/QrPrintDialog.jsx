import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Printer, AlertTriangle } from 'lucide-react';
import { tapProps } from './motion.jsx';
import Spinner from './Spinner.jsx';
import { apiUrl } from '../lib/config.js';

// Physical paper sizes in millimetres (portrait w × h).
const PAPERS = {
  A4: { label: 'A4', w: 210, h: 297 },
  LETTER: { label: 'Letter', w: 215.9, h: 279.4 },
  LEGAL: { label: 'Legal', w: 215.9, h: 355.6 },
};
const PX_PER_MM = 96 / 25.4; // CSS reference pixels per millimetre
const svgUrl = (qrId) => apiUrl(`/api/qr/${qrId}/image.svg`); // vector = crisp at any print size
const CARD_WIDTH = { min: 10, max: 200, fallback: 40 };
const CARD_HEIGHT = { min: 10, max: 300, fallback: 50 };

const clampNum = (v, min, max) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
};

const validDimension = (value, { min, max }) => {
  const n = Number(value);
  return value !== '' && Number.isFinite(n) && n >= min && n <= max ? n : null;
};

// Given the settings, work out how the cards tile across one sheet and how the
// QR square + label split a single card. All maths is in millimetres.
function computeLayout(s) {
  const paper = PAPERS[s.paper];
  const [pw, ph] = s.orientation === 'landscape' ? [paper.h, paper.w] : [paper.w, paper.h];
  const usableW = pw - s.margin * 2;
  const usableH = ph - s.margin * 2;
  const fits = (avail, size) => (size <= 0 ? 0 : Math.max(0, Math.floor((avail + s.gap) / (size + s.gap))));
  const cols = fits(usableW, s.cardW);
  const rows = fits(usableH, s.cardH);
  const perPage = cols * rows;

  // Reserve a strip for the ID label, then size the QR as the largest square
  // that still fits , proportions never distort.
  const labelBelow = s.label === 'below';
  const labelRight = s.label === 'right';
  const pad = 1.4; // inner card padding (mm) around the QR + label
  const labelStrip = s.label === 'none' ? 0 : labelBelow ? 4 : s.cardW * 0.26;
  const availW = s.cardW - pad * 2 - (labelRight ? labelStrip : 0);
  const availH = s.cardH - pad * 2 - (labelBelow ? labelStrip : 0);
  const qr = Math.max(0, Math.min(availW, availH));

  return { pw, ph, usableW, usableH, cols, rows, perPage, qr, pad, labelStrip, labelBelow, labelRight };
}

// One printable sheet: a grid of cards at exact mm dimensions.
function SheetPage({ ids, s, L, isLast }) {
  const labelFont = Math.max(1.9, Math.min(3, s.cardW * 0.075));
  return (
    <div
      className="qr-page"
      style={{
        width: `${L.pw}mm`,
        height: `${L.ph}mm`,
        padding: `${s.margin}mm`,
        boxSizing: 'border-box',
        background: '#fff',
        display: 'grid',
        gridTemplateColumns: `repeat(${L.cols}, ${s.cardW}mm)`,
        gridAutoRows: `${s.cardH}mm`,
        gap: `${s.gap}mm`,
        alignContent: 'start',
        justifyContent: 'start',
        pageBreakAfter: isLast ? 'auto' : 'always',
        breakAfter: isLast ? 'auto' : 'page',
      }}
    >
      {ids.map((id) => (
        <div
          key={id}
          style={{
            width: `${s.cardW}mm`,
            height: `${s.cardH}mm`,
            padding: `${L.pad}mm`,
            boxSizing: 'border-box',
            display: 'flex',
            flexDirection: L.labelRight ? 'row' : 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.8mm',
            overflow: 'hidden',
            color: '#000',
            border: s.cutLines ? '0.2mm dashed #b0b0b0' : 'none',
          }}
        >
          <img
            src={svgUrl(id)}
            alt={id}
            style={{ width: `${L.qr}mm`, height: `${L.qr}mm`, display: 'block', flex: 'none' }}
          />
          {s.label !== 'none' && (
            <span
              style={{
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                fontSize: `${labelFont}mm`,
                lineHeight: 1.1,
                fontWeight: 700,
                textAlign: 'center',
                whiteSpace: 'nowrap',
                writingMode: L.labelRight ? 'vertical-rl' : 'horizontal-tb',
              }}
            >
              {id}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

// Split the selected ids into pages and render every sheet.
function Sheets({ ids, s, L }) {
  if (L.perPage <= 0) return null;
  const pages = [];
  for (let i = 0; i < ids.length; i += L.perPage) pages.push(ids.slice(i, i + L.perPage));
  return (
    <>
      {pages.map((pageIds, i) => (
        <SheetPage key={i} ids={pageIds} s={s} L={L} isLast={i === pages.length - 1} />
      ))}
    </>
  );
}

function Field({ label, children, hint }) {
  return (
    <label className="field-label !mb-0 flex flex-col gap-1">
      <span>{label}{hint && <span className="text-muted-2 font-normal"> {hint}</span>}</span>
      {children}
    </label>
  );
}

export default function QrPrintDialog({ qrIds, onClose }) {
  const [s, setS] = useState({
    paper: 'A4',
    orientation: 'portrait',
    cardW: 40,
    cardH: 50,
    margin: 10,
    gap: 4,
    // The QR ID is never printed alongside the code: the id is private and is only
    // revealed (with a copy button) when a still-unactivated tag is scanned. Kept in
    // state as 'none' so the layout maths still reserves no label strip.
    label: 'none',
    cutLines: true,
  });
  const set = (k, v) => setS((prev) => ({ ...prev, [k]: v }));

  const cardW = validDimension(s.cardW, CARD_WIDTH);
  const cardH = validDimension(s.cardH, CARD_HEIGHT);
  const hasInvalidDimensions = cardW === null || cardH === null;
  const layoutSettings = useMemo(
    () => ({ ...s, cardW: cardW ?? CARD_WIDTH.fallback, cardH: cardH ?? CARD_HEIGHT.fallback }),
    [s, cardW, cardH],
  );
  const L = useMemo(() => computeLayout(layoutSettings), [layoutSettings]);
  const pageCount = L.perPage > 0 ? Math.ceil(qrIds.length / L.perPage) : 0;

  // Preload every unique QR svg so the browser's print pass draws from cache
  // (otherwise the first print can race the image fetch and come out blank).
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setReady(false);
    let left = qrIds.length;
    if (left === 0) { setReady(true); return; }
    const done = () => { if (!cancelled && --left <= 0) setReady(true); };
    const imgs = qrIds.map((id) => {
      const img = new Image();
      img.onload = done;
      img.onerror = done;
      img.src = svgUrl(id);
      return img;
    });
    return () => { cancelled = true; imgs.forEach((i) => { i.onload = i.onerror = null; }); };
  }, [qrIds]);

  // Scale the live preview so a full sheet fits the modal column.
  const previewRef = useRef(null);
  const [scale, setScale] = useState(0.3);
  useLayoutEffect(() => {
    const el = previewRef.current;
    if (!el) return;
    const measure = () => {
      const w = el.clientWidth;
      const fitScale = w / (L.pw * PX_PER_MM);
      // Keep QR modules readable on phones. The preview can scroll horizontally
      // when the readable sheet is wider than the viewport.
      setScale(Math.min(0.9, Math.max(w < 768 ? 0.48 : 0, fitScale)));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [L.pw]);

  // Esc closes; lock body scroll while open.
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [onClose]);

  const tooBig = L.perPage <= 0;
  const pageW = L.pw * PX_PER_MM;
  const pageH = L.ph * PX_PER_MM;

  // Print styling is injected live: @page drives the physical sheet size, and
  // the isolation block prints ONLY the off-screen print-root, not the app/modal.
  const printCss = `
    @media print {
      @page { size: ${L.pw}mm ${L.ph}mm; margin: 0; }
      html, body { background: #fff !important; }
      body * { visibility: hidden !important; }
      #qr-print-root, #qr-print-root * { visibility: visible !important; }
      #qr-print-root { position: absolute !important; left: 0 !important; top: 0 !important; }
    }
  `;

  return createPortal(
    <>
      <style>{printCss}</style>

      {/* Off-screen real-size render used only by the print pass. */}
      <div id="qr-print-root" aria-hidden="true" style={{ position: 'fixed', left: '-100000px', top: 0 }}>
        {!tooBig && <Sheets ids={qrIds} s={layoutSettings} L={L} />}
      </div>

      <AnimatePresence>
        <motion.div
          key="print-backdrop"
          className="fixed inset-0 z-[80] bg-black/40 backdrop-blur-[2px] print:hidden"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onClick={onClose}
        />
        <motion.div
          key="print-panel"
          className="fixed inset-x-0 bottom-0 top-0 md:inset-6 z-[81] bg-bg border border-border md:rounded shadow-brutal-sm overflow-hidden flex flex-col print:hidden"
          role="dialog" aria-modal="true" aria-label="Print QR codes"
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}
          transition={{ type: 'spring', stiffness: 400, damping: 40 }}
        >
          <div className="flex items-center justify-between gap-4 px-5 py-4 border-b border-border flex-none">
            <h2 className="font-display font-bold text-lg m-0 flex items-center gap-2">
              <Printer size={20} strokeWidth={2.2} /> Print QR codes
            </h2>
            <motion.button
              className="w-9 h-9 grid place-items-center rounded-xs text-muted border border-border bg-card hover:bg-surface hover:text-ink transition-colors cursor-pointer"
              onClick={onClose} whileTap={{ scale: 0.95 }} aria-label="Close"
            >
              <X size={18} strokeWidth={2.5} />
            </motion.button>
          </div>

          <div className="flex-1 min-h-0 flex flex-col md:flex-row">
            {/* Controls */}
            <div className="md:w-[320px] md:flex-none border-b md:border-b-0 md:border-r border-border overflow-y-auto p-5 flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-4">
                <Field label="Paper">
                  <select value={s.paper} onChange={(e) => set('paper', e.target.value)} className="!mt-0">
                    {Object.entries(PAPERS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </Field>
                <Field label="Orientation">
                  <select value={s.orientation} onChange={(e) => set('orientation', e.target.value)} className="!mt-0">
                    <option value="portrait">Portrait</option>
                    <option value="landscape">Landscape</option>
                  </select>
                </Field>
                <Field label="Card width" hint="mm">
                  <input type="number" min={CARD_WIDTH.min} max={CARD_WIDTH.max} step="any" value={s.cardW}
                    aria-invalid={cardW === null}
                    onChange={(e) => set('cardW', e.target.value)} className="!mt-0" />
                  {cardW === null && <span className="text-xs text-danger font-normal">Enter a number from {CARD_WIDTH.min} to {CARD_WIDTH.max} mm.</span>}
                </Field>
                <Field label="Card height" hint="mm">
                  <input type="number" min={CARD_HEIGHT.min} max={CARD_HEIGHT.max} step="any" value={s.cardH}
                    aria-invalid={cardH === null}
                    onChange={(e) => set('cardH', e.target.value)} className="!mt-0" />
                  {cardH === null && <span className="text-xs text-danger font-normal">Enter a number from {CARD_HEIGHT.min} to {CARD_HEIGHT.max} mm.</span>}
                </Field>
                <Field label="Page margin" hint="mm">
                  <input type="number" min="0" max="40" value={s.margin}
                    onChange={(e) => set('margin', clampNum(e.target.value, 0, 40))} className="!mt-0" />
                </Field>
                <Field label="Cut spacing" hint="mm">
                  <input type="number" min="0" max="30" value={s.gap}
                    onChange={(e) => set('gap', clampNum(e.target.value, 0, 30))} className="!mt-0" />
                </Field>
              </div>

              <label className="flex items-center gap-2.5 font-semibold text-sm cursor-pointer">
                <input type="checkbox" checked={s.cutLines} onChange={(e) => set('cutLines', e.target.checked)} />
                Show cut guides
              </label>

              {/* Fit summary */}
              <div className={`card !mb-0 ${tooBig ? '!border-danger' : ''}`}>
                {tooBig ? (
                  <p className="m-0 text-sm text-danger flex items-start gap-2">
                    <AlertTriangle size={16} className="flex-none mt-0.5" />
                    Card is larger than the printable area. Reduce the card size or margin.
                  </p>
                ) : (
                  <div className="text-sm leading-relaxed">
                    <div className="flex justify-between"><span className="text-muted">Grid</span><span className="font-semibold tabular-nums">{L.cols} × {L.rows}</span></div>
                    <div className="flex justify-between"><span className="text-muted">Per page</span><span className="font-semibold tabular-nums">{L.perPage}</span></div>
                    <div className="flex justify-between"><span className="text-muted">Selected</span><span className="font-semibold tabular-nums">{qrIds.length}</span></div>
                    <div className="flex justify-between"><span className="text-muted">Pages</span><span className="font-semibold tabular-nums">{pageCount}</span></div>
                    <div className="flex justify-between"><span className="text-muted">QR size</span><span className="font-semibold tabular-nums">{L.qr.toFixed(1)} mm</span></div>
                  </div>
                )}
              </div>

              <p className="text-xs text-muted-2 m-0 leading-relaxed">
                In the print dialog choose <strong>Save as PDF</strong> and set margins to <strong>None</strong>.
                The QR ID is never printed on the label , it stays private and is revealed only when an
                unactivated tag is scanned. Printing does not change any QR’s status.
              </p>
            </div>

            {/* Live preview */}
            <div ref={previewRef} className="flex-1 min-h-0 overflow-auto bg-surface p-5 flex flex-col items-start md:items-center gap-5">
              {tooBig ? (
                <p className="text-muted text-sm m-auto">Nothing to preview , adjust the card size.</p>
              ) : (
                Array.from({ length: pageCount }).map((_, i) => {
                  const pageIds = qrIds.slice(i * L.perPage, (i + 1) * L.perPage);
                  return (
                    <div key={i} className="flex flex-col items-center gap-1.5 mx-auto md:mx-0">
                      <div
                        className="relative shadow-brutal-sm border border-border"
                        style={{ width: pageW * scale, height: pageH * scale }}
                      >
                        <div style={{ position: 'absolute', top: 0, left: 0, width: pageW, height: pageH, transform: `scale(${scale})`, transformOrigin: 'top left' }}>
                          <SheetPage ids={pageIds} s={layoutSettings} L={L} isLast />
                        </div>
                      </div>
                      <span className="text-xs text-muted-2">Page {i + 1} of {pageCount}</span>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 px-5 py-4 border-t border-border flex-none">
            <span className="text-sm text-muted">
              {tooBig ? 'N/A' : `${qrIds.length} QR${qrIds.length === 1 ? '' : 's'} · ${pageCount} page${pageCount === 1 ? '' : 's'}`}
            </span>
            <div className="flex gap-2.5">
              <motion.button className="btn" onClick={onClose} {...tapProps}>Cancel</motion.button>
              <motion.button
                className="btn btn-primary"
                onClick={() => window.print()}
                disabled={tooBig || hasInvalidDimensions || !ready || qrIds.length === 0}
                {...tapProps}
              >
                {ready ? <Printer size={18} strokeWidth={2.5} /> : <Spinner size={18} />}
                {ready ? 'Print / Save as PDF' : 'Preparing…'}
              </motion.button>
            </div>
          </div>
        </motion.div>
      </AnimatePresence>
    </>,
    document.body,
  );
}
