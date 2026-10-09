import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ImageUp, Camera, Link2, X, RotateCcw, WifiOff, AlertTriangle, ImageOff } from 'lucide-react';
import { api } from '../lib/api.js';
import { assetUrl } from '../lib/config.js';
import { notify } from '../lib/toast.jsx';
import { tapProps } from './motion.jsx';
import Spinner from './Spinner.jsx';
import CameraCapture from './CameraCapture.jsx';

// Single-photo editor for an item. Three sources, all hitting the existing owner
// endpoints (auth + ownership enforced server-side):
//   - device upload / camera -> POST /owner/items/:qrId/photo        (multipart, progress)
//   - import by URL          -> POST /owner/items/:qrId/photo-url     (JSON, server-side fetch)
// The backend replaces only the photo fields (merge), so an in-flight photo change
// never clobbers unsaved name/description edits elsewhere on the page, and a
// concurrent text save won't undo the photo. Status (LOST/RECOVERED) is untouched.
//
// Success is reported only after the request resolves; on failure the previous
// photo is left intact (the server keeps it) and a Retry is offered.

const MAX_BYTES = 5 * 1024 * 1024;
const ACCEPT = 'image/png,image/jpeg,image/webp,image/gif';
const ACCEPT_SET = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);

// Fetch the active storage backend once per session so we can warn when photos
// live on ephemeral local disk. Cached so every PhotoField mount doesn't refetch.
let storageModeCache;
async function getStorageMode() {
  if (storageModeCache !== undefined) return storageModeCache;
  try {
    const h = await api.get('/health', { auth: false });
    storageModeCache = h?.storageMode || null;
  } catch {
    storageModeCache = null;
  }
  return storageModeCache;
}

function validUrl(s) {
  try {
    const u = new URL(s.trim());
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

export default function PhotoField({ qrId, item, onChange }) {
  const fileRef = useRef(null);
  const abortRef = useRef(null);
  const retryRef = useRef(null);

  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(null); // 0..1 (multipart) or null (indeterminate)
  const [statusText, setStatusText] = useState('');
  const [failed, setFailed] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [urlOpen, setUrlOpen] = useState(false);
  const [url, setUrl] = useState('');
  const [urlErr, setUrlErr] = useState('');
  const [urlPreviewOk, setUrlPreviewOk] = useState(null); // null untested, true/false
  const [offline, setOffline] = useState(!navigator.onLine);
  const [storageMode, setStorageMode] = useState(storageModeCache ?? null);

  const current = item?.photoThumbUrl || item?.photoUrl || null;

  useEffect(() => {
    getStorageMode().then(setStorageMode);
  }, []);

  useEffect(() => {
    const on = () => setOffline(false);
    const off = () => setOffline(true);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  // Fold a successful response into the page cache + toast once, after completion.
  function applyResult(res) {
    const it = res?.item || {};
    onChange?.({
      photoUrl: it.photoUrl ?? null,
      photoThumbUrl: it.photoThumbUrl ?? null,
      photoKey: it.photoKey ?? null,
      photoHash: it.photoHash ?? null,
    });
    if (res?.storageMode) {
      storageModeCache = res.storageMode;
      setStorageMode(res.storageMode);
    }
    if (res?.deduped) notify.info('That image is already this item’s photo.');
    else notify.success('Photo updated.');
  }

  function handleError(e) {
    if (e?.aborted) {
      notify.info('Upload cancelled.');
      return; // not a failure state — no retry offered
    }
    setFailed(true);
    notify.error(e?.message || 'Could not update the photo.');
  }

  async function uploadBlob(fileOrBlob, filename) {
    if (offline) return notify.error('You’re offline. Reconnect to change the photo.');
    const type = fileOrBlob.type || '';
    if (!ACCEPT_SET.has(type)) return notify.error('Use a PNG, JPG, WebP or GIF image.');
    if (fileOrBlob.size > MAX_BYTES) return notify.error('Image must be 5MB or smaller.');

    const controller = new AbortController();
    abortRef.current = controller;
    retryRef.current = () => uploadBlob(fileOrBlob, filename);
    setFailed(false);
    setBusy(true);
    setProgress(0);
    setStatusText('Uploading…');
    try {
      const form = new FormData();
      form.append('photo', fileOrBlob, filename || fileOrBlob.name || 'photo');
      const res = await api.uploadProgress(`/owner/items/${qrId}/photo`, form, {
        onProgress: setProgress,
        signal: controller.signal,
      });
      applyResult(res);
    } catch (e) {
      handleError(e);
    } finally {
      setBusy(false);
      setProgress(null);
      setStatusText('');
      abortRef.current = null;
    }
  }

  async function importUrl() {
    const value = url.trim();
    if (!validUrl(value)) {
      setUrlErr('Enter a valid http(s) image URL.');
      return;
    }
    if (offline) return notify.error('You’re offline. Reconnect to import an image.');
    setUrlErr('');
    const controller = new AbortController();
    abortRef.current = controller;
    retryRef.current = () => importUrl();
    setFailed(false);
    setBusy(true);
    setProgress(null); // server does the fetching — progress is indeterminate
    setStatusText('Importing…');
    try {
      const res = await api.post(`/owner/items/${qrId}/photo-url`, { url: value }, { signal: controller.signal });
      applyResult(res);
      setUrlOpen(false);
      setUrl('');
      setUrlPreviewOk(null);
    } catch (e) {
      handleError(e);
    } finally {
      setBusy(false);
      setStatusText('');
      abortRef.current = null;
    }
  }

  function cancel() {
    abortRef.current?.abort();
  }
  function retry() {
    retryRef.current?.();
  }

  function onFileInput(e) {
    const f = e.target.files?.[0];
    e.target.value = ''; // allow re-picking the same file
    if (f) uploadBlob(f);
  }

  // No item yet: photo belongs to a registered item. Guide the owner to save first.
  if (!item) {
    return (
      <div className="rounded-sm border border-border bg-surface/60 p-4 text-sm text-muted">
        Save the item details first, then add a photo.
      </div>
    );
  }

  const pct = progress === null ? null : Math.round(progress * 100);
  const actionsDisabled = busy || offline;

  return (
    <div className="flex flex-col gap-3">
      {/* Current / empty preview */}
      <div className="flex items-start gap-4 flex-wrap">
        <div className="w-[160px] h-[160px] flex-none rounded-sm border border-border bg-surface shadow-brutal-sm overflow-hidden grid place-items-center">
          {current ? (
            <img src={assetUrl(current)} alt="Current item photo" className="w-full h-full object-cover" />
          ) : (
            <span className="text-muted-2 text-xs font-medium flex flex-col items-center gap-1.5">
              <ImageOff size={22} strokeWidth={2} /> No photo
            </span>
          )}
        </div>

        <div className="flex-1 min-w-[200px] flex flex-col gap-2.5">
          <div className="flex flex-wrap gap-2">
            <motion.button
              type="button"
              className="btn btn-sm"
              onClick={() => fileRef.current?.click()}
              disabled={actionsDisabled}
              {...tapProps}
            >
              <ImageUp size={16} strokeWidth={2.5} /> {current ? 'Replace' : 'Upload'}
            </motion.button>
            <motion.button
              type="button"
              className="btn btn-sm"
              onClick={() => setCameraOpen(true)}
              disabled={actionsDisabled}
              {...tapProps}
            >
              <Camera size={16} strokeWidth={2.5} /> Camera
            </motion.button>
            <motion.button
              type="button"
              className="btn btn-sm"
              onClick={() => { setUrlOpen((v) => !v); setUrlErr(''); setUrlPreviewOk(null); }}
              disabled={actionsDisabled}
              aria-expanded={urlOpen}
              {...tapProps}
            >
              <Link2 size={16} strokeWidth={2.5} /> From URL
            </motion.button>
          </div>
          <p className="text-muted-2 text-[.8rem] m-0">PNG, JPG, WebP or GIF · up to 5MB. We optimize and resize automatically.</p>

          {/* URL import row */}
          <AnimatePresence initial={false}>
            {urlOpen && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="flex flex-col gap-2 pt-1">
                  <div className="flex gap-2 items-start">
                    <input
                      type="url"
                      inputMode="url"
                      maxLength={2048}
                      placeholder="https://example.com/photo.jpg"
                      value={url}
                      onChange={(e) => { setUrl(e.target.value); setUrlErr(''); setUrlPreviewOk(null); }}
                      aria-label="Image URL"
                      aria-invalid={urlErr ? true : undefined}
                      className="flex-1 min-w-0 !mt-0"
                      disabled={busy}
                    />
                    <motion.button
                      type="button"
                      className="btn btn-sm btn-primary flex-none"
                      onClick={importUrl}
                      disabled={actionsDisabled || !url.trim()}
                      {...tapProps}
                    >
                      Import
                    </motion.button>
                  </div>
                  {urlErr && <p className="status-msg status-error !mt-0 !py-1.5 text-[.82rem]">{urlErr}</p>}
                  {validUrl(url) && (
                    <div className="flex items-center gap-2 text-[.8rem] text-muted">
                      <img
                        src={url.trim()}
                        alt=""
                        className="w-10 h-10 object-cover rounded-xs border border-border"
                        onLoad={() => setUrlPreviewOk(true)}
                        onError={() => setUrlPreviewOk(false)}
                      />
                      {urlPreviewOk === false
                        ? <span className="text-warn">Preview couldn’t load — the server will validate it on import.</span>
                        : <span>Preview</span>}
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Progress / cancel while busy */}
      {busy && (
        <div className="rounded-sm border border-border bg-surface/60 p-3 flex items-center gap-3" role="status" aria-live="polite">
          <Spinner size={18} />
          <div className="flex-1 min-w-0">
            <div className="flex justify-between text-[.8rem] font-semibold mb-1">
              <span>{statusText}</span>
              {pct !== null && <span className="tabular-nums">{pct}%</span>}
            </div>
            <div className="h-2 rounded-full bg-border overflow-hidden" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct ?? undefined}>
              <div
                className={`h-full bg-primary ${pct === null ? 'animate-pulse w-1/3' : ''}`}
                style={pct === null ? undefined : { width: `${pct}%`, transition: 'width .15s linear' }}
              />
            </div>
          </div>
          <motion.button type="button" className="btn btn-sm btn-ghost flex-none" onClick={cancel} {...tapProps}>
            <X size={15} strokeWidth={2.5} /> Cancel
          </motion.button>
        </div>
      )}

      {/* Retry after a failure (previous photo left intact) */}
      {failed && !busy && (
        <div className="status-msg status-error flex items-center justify-between gap-3 !mt-0">
          <span className="flex items-center gap-2 text-[.85rem]"><AlertTriangle size={16} /> Photo update failed. Your previous photo is unchanged.</span>
          <motion.button type="button" className="btn btn-sm flex-none" onClick={retry} {...tapProps}>
            <RotateCcw size={15} strokeWidth={2.5} /> Retry
          </motion.button>
        </div>
      )}

      {/* Offline banner */}
      {offline && (
        <p className="status-msg status-error flex items-center gap-2 !mt-0 text-[.85rem]">
          <WifiOff size={16} /> You’re offline — photo changes are paused until you reconnect.
        </p>
      )}

      {/* Ephemeral-storage warning */}
      {storageMode === 'local' && (
        <p className="rounded-sm border border-warn/50 bg-warn-weak text-warn px-3 py-2 text-[.82rem] flex items-center gap-2 !mt-0">
          <AlertTriangle size={15} className="flex-none" />
          Photos are being saved to local server storage and may be lost when the server restarts or redeploys.
        </p>
      )}

      <input
        ref={fileRef}
        type="file"
        accept={ACCEPT}
        onChange={onFileInput}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
      />

      {cameraOpen && (
        <CameraCapture
          onClose={() => setCameraOpen(false)}
          onCapture={(file) => uploadBlob(file, file.name)}
        />
      )}
    </div>
  );
}
