import { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Save, Plus, Trash2 } from 'lucide-react';
import { CONTACT_TYPES, DEFAULT_CONTACT_TYPE, getContactType, validateContactValue } from '../lib/contactTypes.jsx';
import { api } from '../lib/api.js';
import { useResource } from '../store/dataStore.js';
import { tapProps } from '../components/motion.jsx';
import Spinner from '../components/Spinner.jsx';
import { Skeleton, SkeletonForm } from '../components/Skeleton.jsx';
import { notify } from '../lib/toast.jsx';
import PhotoField from '../components/PhotoField.jsx';
import CharCount from '../components/CharCount.jsx';
import { LIMITS } from '../lib/limits.js';

// Unified item + QR-page editor. Item details, page customization and public
// contact info live on one screen so owners never bounce between pages. Every
// edit is local until Save; a successful Save folds edits into the cache and
// returns to the QR view.
export default function ItemManage() {
  const { qrId } = useParams();
  const navigate = useNavigate();
  const { data, error: loadError, loading, mutate } = useResource(`manage/${qrId}`, () => Promise.all([
    api.get(`/owner/items/${qrId}`),
    api.get(`/owner/customizations/${qrId}`),
    api.get(`/owner/contact/${qrId}`),
  ]).then(([it, c, ct]) => ({ item: it.item || null, customization: c.customization, contact: ct.contact })));

  const [itemEdit, setItemEdit] = useState(null);
  const [customEdit, setCustomEdit] = useState(null);
  const [contactEdit, setContactEdit] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [busy, setBusy] = useState(false);

  const item = data?.item ?? null;
  const form = itemEdit ?? { name: item?.name || '', description: item?.description || '', recoveryInstructions: item?.recoveryInstructions || '' };
  const custom = customEdit ?? data?.customization ?? null;
  const contact = contactEdit ?? data?.contact ?? null;
  // Editor always shows at least one row; an empty contact seeds a blank Email.
  const fields = contact?.fields?.length ? contact.fields : [{ type: DEFAULT_CONTACT_TYPE, value: '', show: true }];

  // Drop pending edits when switching to a different QR.
  useEffect(() => { setItemEdit(null); setCustomEdit(null); setContactEdit(null); setFieldErrors({}); }, [qrId]);

  const setItem = (k) => (e) => setItemEdit({ ...form, [k]: e.target.value });
  const setC = (k) => (e) => setCustomEdit({ ...custom, [k]: e.target.value });

  // Contact fields are a dynamic list; every edit rewrites the whole array.
  const commitFields = (next) => setContactEdit({ ...(contact || {}), fields: next });
  // Preferred-method / best-time preferences live alongside the fields on the same doc.
  const setContactPref = (k) => (e) => setContactEdit({ ...(contact || {}), [k]: e.target.value });
  const clearFieldError = (i) => setFieldErrors((prev) => { const n = { ...prev }; delete n[i]; return n; });
  const setFieldType = (i) => (e) => { commitFields(fields.map((f, j) => (j === i ? { ...f, type: e.target.value } : f))); clearFieldError(i); };
  const setFieldValue = (i) => (e) => { commitFields(fields.map((f, j) => (j === i ? { ...f, value: e.target.value } : f))); clearFieldError(i); };
  const toggleFieldShow = (i) => (e) => commitFields(fields.map((f, j) => (j === i ? { ...f, show: e.target.checked } : f)));
  const addField = () => commitFields([...fields, { type: DEFAULT_CONTACT_TYPE, value: '', show: true }]);
  const removeField = (i) => () => {
    const next = fields.filter((_, j) => j !== i);
    commitFields(next.length ? next : [{ type: DEFAULT_CONTACT_TYPE, value: '', show: true }]);
    setFieldErrors({});
  };

  async function onSave(e) {
    e.preventDefault();

    // Validate every contact field before touching the network.
    const errs = {};
    fields.forEach((f, i) => { const msg = validateContactValue(f.type, f.value); if (msg) errs[i] = msg; });
    if (Object.keys(errs).length) {
      setFieldErrors(errs);
      notify.warning('Fix the highlighted contact fields before saving.');
      return;
    }

    setBusy(true);
    try {
      await Promise.all([
        api.put(`/owner/items/${qrId}`, { name: form.name, description: form.description, recoveryInstructions: form.recoveryInstructions }),
        api.put(`/owner/customizations/${qrId}`, {
          template: custom.template,
          bgColor: custom.bgColor,
          accentColor: custom.accentColor,
          pageTitle: custom.pageTitle,
          finderMessage: custom.finderMessage,
          contactButtonText: custom.contactButtonText,
          alwaysShowInfo: !!custom.alwaysShowInfo,
        }),
        api.put(`/owner/contact/${qrId}`, {
          fields: fields.map((f) => ({ type: f.type, value: f.value.trim(), show: !!f.show })),
          preferredMethod: contact?.preferredMethod || '',
        }),
      ]);
      // The photo is managed independently by <PhotoField> (its own endpoints),
      // so Save only touches text/customization/contact. Spreading the existing
      // cached item preserves whatever photo fields PhotoField already wrote.
      mutate((d) => ({
        ...(d || {}),
        item: { ...(d?.item || {}), ...form },
        customization: custom,
        contact: {
          ...(d?.contact || {}),
          fields: fields.map((f) => ({ type: f.type, value: f.value.trim(), show: !!f.show })),
          preferredMethod: contact?.preferredMethod || '',
        },
      }));
      notify.success('Changes saved.');
      navigate(`/qr/${qrId}`);
    } catch (err) {
      notify.error(err.message);
      setBusy(false);
    }
  }

  if (loadError && !data) return <p className="status-msg status-error">{loadError}</p>;
  if (loading || !custom || !contact) return (
    <div>
      <div className="flex items-center gap-3 mb-[1.1rem]">
        <Skeleton className="h-9 w-20 !rounded-xs" />
        <Skeleton className="h-8 w-48" />
      </div>
      <SkeletonForm fields={6} className="max-w-[560px]" />
    </div>
  );

  return (
    <div>
      <div className="flex items-center gap-3 mb-[1.1rem]">
        <Link className="btn btn-ghost btn-sm self-start" to={`/qr/${qrId}`}><ArrowLeft size={16} strokeWidth={2.5} /> Back</Link>
        <h1>Manage {qrId}</h1>
      </div>

      <form onSubmit={onSave} className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        <div className="card">
          <h3>Item details</h3>
          <label className="field-label">Item name
            <input value={form.name} onChange={setItem('name')} maxLength={LIMITS.itemName} required />
            <CharCount value={form.name} max={LIMITS.itemName} />
          </label>
          <label className="field-label">Description
            <textarea rows={3} value={form.description} onChange={setItem('description')} maxLength={LIMITS.itemDescription} />
            <CharCount value={form.description} max={LIMITS.itemDescription} />
          </label>
          <label className="field-label">Recovery instructions <span className="text-muted">(optional)</span>
            <textarea
              rows={3}
              value={form.recoveryInstructions || ''}
              onChange={setItem('recoveryInstructions')}
              maxLength={LIMITS.recoveryInstructions}
              placeholder="Where or how a finder should return it — e.g. drop at the front desk of 123 Main St, or call to arrange pickup."
            />
            <CharCount value={form.recoveryInstructions || ''} max={LIMITS.recoveryInstructions} />
            <p className="text-muted text-[.82rem] mt-1">Shown to finders only when the item is lost (or if “Always show information” is on). Don’t put serial numbers or secret marks here — this page is public.</p>
          </label>
          <div className="field-label">Photo (optional)
            <div className="mt-1">
              <PhotoField
                qrId={qrId}
                item={item}
                onChange={(patch) => mutate((d) => ({ ...(d || {}), item: { ...(d?.item || {}), ...patch } }))}
              />
            </div>
          </div>
        </div>

        <div className="card">
          <h3>Text</h3>
          <label className="field-label">Page title
            <input value={custom.pageTitle || ''} onChange={setC('pageTitle')} maxLength={LIMITS.pageTitle} placeholder="(optional)" />
          </label>
          <label className="field-label">Finder message
            <textarea rows={2} value={custom.finderMessage || ''} onChange={setC('finderMessage')} maxLength={LIMITS.finderMessage} />
            <CharCount value={custom.finderMessage || ''} max={LIMITS.finderMessage} />
          </label>
          <label className="field-label">Contact button text
            <input value={custom.contactButtonText || ''} onChange={setC('contactButtonText')} maxLength={LIMITS.contactButtonText} />
          </label>

          <h3>Appearance</h3>
          <label className="field-label">Accent color
            <div className="flex items-center gap-2.5 mt-1.5">
              <input
                type="color"
                value={/^#[0-9a-fA-F]{6}$/.test(custom.accentColor || '') ? custom.accentColor : '#2563eb'}
                onChange={(e) => setCustomEdit({ ...custom, accentColor: e.target.value })}
                className="h-10 w-12 flex-none rounded-sm border border-border bg-card p-1 cursor-pointer"
                aria-label="Accent color"
              />
              <input
                value={custom.accentColor || ''}
                onChange={(e) => setCustomEdit({ ...custom, accentColor: e.target.value })}
                maxLength={7}
                spellCheck={false}
                autoCapitalize="none"
                className="!mt-0 font-mono w-28"
                placeholder="#2563eb"
                aria-label="Accent color hex"
              />
            </div>
            <p className="text-muted text-[.82rem] mt-1">Drives the title, buttons and highlights on your public finder page.</p>
          </label>

          <h3>Visibility</h3>
          <div className="flex items-start gap-3 rounded-sm border border-border bg-surface/60 p-3">
            <label className="switch flex-none mt-0.5" title="Always show information">
              <input
                type="checkbox"
                checked={!!custom.alwaysShowInfo}
                onChange={(e) => setCustomEdit({ ...custom, alwaysShowInfo: e.target.checked })}
              />
              <span className="track"></span>
            </label>
            <div className="min-w-0">
              <p className="font-semibold">Always show information</p>
              <p className="text-muted text-[.85rem]">
                On: anyone who scans sees the item details and the contact fields you
                switched on below — even when the item is not reported lost.
                Off: those details stay hidden until you mark the item lost.
                Only fields you’ve made public are ever shown.
              </p>
            </div>
          </div>
        </div>

        <div className="card">
          <h3>Public contact <span className="text-muted">(shown when item is LOST, or always if the setting above is on)</span></h3>
          <p className="text-muted text-[.85rem]">Add one or more ways a finder can reach you. Pick a type for each, then use the switch to show or hide it on the public page.</p>

          <div className="flex flex-col gap-2.5">
            <AnimatePresence initial={false}>
              {fields.map((f, i) => {
                const TypeIcon = getContactType(f.type).icon;
                const err = fieldErrors[i];
                return (
                  <motion.div
                    key={i}
                    layout
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.2, ease: [0.2, 0.8, 0.2, 1] }}
                    className="rounded-sm border border-border bg-surface/60 p-3 flex flex-col gap-2.5"
                  >
                    <div className="flex items-center gap-2">
                      <TypeIcon size={18} strokeWidth={2.2} className="flex-none text-muted" />
                      <select
                        className="flex-1 min-w-0"
                        value={f.type}
                        onChange={setFieldType(i)}
                        aria-label="Contact type"
                      >
                        {CONTACT_TYPES.map((t) => (
                          <option key={t.type} value={t.type}>{t.label}</option>
                        ))}
                      </select>
                      <label className="switch flex-none" title="Show this on the public page">
                        <input type="checkbox" checked={!!f.show} onChange={toggleFieldShow(i)} />
                        <span className="track"></span>
                      </label>
                      <motion.button
                        type="button"
                        className="btn btn-ghost btn-sm !px-2 flex-none"
                        onClick={removeField(i)}
                        disabled={fields.length === 1}
                        title="Remove this field"
                        aria-label="Remove field"
                        {...tapProps}
                      >
                        <Trash2 size={16} strokeWidth={2.5} />
                      </motion.button>
                    </div>
                    <input
                      value={f.value || ''}
                      onChange={setFieldValue(i)}
                      maxLength={LIMITS.contactValue}
                      placeholder={getContactType(f.type).placeholder}
                      inputMode={getContactType(f.type).inputMode}
                      aria-invalid={err ? true : undefined}
                    />
                    {err && <p className="status-msg status-error !mt-0 !py-1.5 text-[.82rem]">{err}</p>}
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>

          <motion.button type="button" className="btn btn-ghost btn-sm mt-3" onClick={addField} {...tapProps}>
            <Plus size={16} strokeWidth={2.5} /> Add contact field
          </motion.button>

          <h3 className="mt-5">Contact preferences <span className="text-muted">(optional)</span></h3>
          <p className="text-muted text-[.85rem]">Help a finder reach you the right way. Shown on the public page alongside your contact details.</p>
          <label className="field-label">Preferred method
            <select value={contact?.preferredMethod || ''} onChange={setContactPref('preferredMethod')}>
              <option value="">No preference</option>
              {Array.from(new Set(fields.filter((f) => (f.value || '').trim()).map((f) => f.type))).map((t) => (
                <option key={t} value={t}>{getContactType(t).label}</option>
              ))}
            </select>
          </label>
        </div>

        <motion.button className="btn btn-primary lg:col-span-2 justify-self-start" disabled={busy} {...tapProps}>
          {busy ? <Spinner size={18} /> : <Save size={18} strokeWidth={2.5} />}
          {busy ? 'Saving…' : 'Save'}
        </motion.button>
      </form>
    </div>
  );
}
