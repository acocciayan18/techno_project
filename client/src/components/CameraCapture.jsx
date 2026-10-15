import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Camera, RefreshCw, Check, AlertTriangle, ImageUp } from 'lucide-react';
import { tapProps } from './motion.jsx';
import Spinner from './Spinner.jsx';

// Live camera capture modal. Flow: request permission -> live preview -> snap ->
// review (retake / use). Handles denied permission + no-camera by falling back to
// the OS file picker (which on phones can open the camera directly via `capture`).
// Hands the chosen image back as a Blob via onCapture; never uploads itself.
//
// The capture is downscaled client-side (longest edge <= MAX_EDGE) and encoded as
// JPEG , a first optimization pass before the backend re-optimizes.
const MAX_EDGE = 1600;

export default function CameraCapture({ onCapture, onClose }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const fileRef = useRef(null);
  const closeBtnRef = useRef(null);
  const [phase, setPhase] = useState('init'); // init | live | captured | error
  const [errorMsg, setErrorMsg] = useState('');
  const [preview, setPreview] = useState(null); // { url, blob }

  const stopStream = useCallback(() => {
    const s = streamRef.current;
    if (s) {
      s.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  const start = useCallback(async () => {
    setErrorMsg('');
    setPhase('init');
    if (!navigator.mediaDevices?.getUserMedia) {
      setPhase('error');
      setErrorMsg('This browser does not support in-page camera capture. Choose a photo instead.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      setPhase('live');
    } catch (err) {
      setPhase('error');
      // NotAllowedError = user/OS denied; NotFoundError = no camera present.
      if (err?.name === 'NotAllowedError' || err?.name === 'SecurityError') {
        setErrorMsg('Camera permission was denied. Allow it in your browser settings, or choose a photo instead.');
      } else if (err?.name === 'NotFoundError' || err?.name === 'OverconstrainedError') {
        setErrorMsg('No camera was found on this device. Choose a photo instead.');
      } else {
        setErrorMsg('Could not start the camera. Choose a photo instead.');
      }
    }
  }, []);

  // Start on mount; always release the camera on unmount.
  useEffect(() => {
    start();
    return () => stopStream();
  }, [start, stopStream]);

  // Esc closes; lock body scroll; focus the close button.
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const t = setTimeout(() => closeBtnRef.current?.focus(), 0);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
      clearTimeout(t);
    };
  }, [onClose]);

  function snap() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !video.videoWidth) return;
    const scale = Math.min(1, MAX_EDGE / Math.max(video.videoWidth, video.videoHeight));
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        if (preview?.url) URL.revokeObjectURL(preview.url);
        setPreview({ url: URL.createObjectURL(blob), blob });
        setPhase('captured');
        stopStream();
      },
      'image/jpeg',
      0.9,
    );
  }

  function retake() {
    if (preview?.url) URL.revokeObjectURL(preview.url);
    setPreview(null);
    start();
  }

  function use() {
    if (!preview?.blob) return;
    const file = new File([preview.blob], `camera-${Date.now()}.jpg`, { type: 'image/jpeg' });
    stopStream();
    onCapture(file);
    onClose();
  }

  // OS file picker fallback (denied permission / no camera / unsupported).
  function onFilePick(e) {
    const file = e.target.files?.[0];
    if (file) {
      stopStream();
      onCapture(file);
      onClose();
    }
  }

  return createPortal(
    <AnimatePresence>
      <motion.div
        key="cam-backdrop"
        className="fixed inset-0 z-[85] bg-black/60 backdrop-blur-[2px]"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.16 }}
        onClick={onClose}
      />
      <div className="fixed inset-0 z-[86] grid place-items-center p-4 pointer-events-none">
        <motion.div
          key="cam-panel"
          className="card !mb-0 w-full max-w-[520px] pointer-events-auto shadow-brutal"
          role="dialog"
          aria-modal="true"
          aria-label="Take a photo"
          initial={{ opacity: 0, scale: 0.96, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 12 }}
          transition={{ type: 'spring', stiffness: 420, damping: 32 }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between gap-4 mb-3">
            <h2 className="font-display font-bold text-lg m-0 flex items-center gap-2">
              <Camera size={20} strokeWidth={2.2} /> Take a photo
            </h2>
            <motion.button
              ref={closeBtnRef}
              type="button"
              className="w-9 h-9 grid place-items-center rounded-xs text-muted border border-border bg-card hover:bg-surface hover:text-ink transition-colors cursor-pointer"
              onClick={onClose}
              whileTap={{ scale: 0.95 }}
              aria-label="Close camera"
            >
              <X size={18} strokeWidth={2.5} />
            </motion.button>
          </div>

          {/* Stage */}
          <div className="relative w-full aspect-[4/3] rounded-sm overflow-hidden bg-black/90 border border-border grid place-items-center">
            {/* Live video (kept mounted; hidden while reviewing) */}
            <video
              ref={videoRef}
              playsInline
              muted
              className={`w-full h-full object-cover ${phase === 'live' ? '' : 'hidden'}`}
            />
            {phase === 'init' && <Spinner size={28} className="text-white" />}
            {phase === 'captured' && preview && (
              <img src={preview.url} alt="Captured preview" className="w-full h-full object-cover" />
            )}
            {phase === 'error' && (
              <div className="p-5 text-center text-white/90">
                <AlertTriangle size={26} className="mx-auto mb-2 text-warn" />
                <p className="text-sm leading-relaxed m-0">{errorMsg}</p>
              </div>
            )}
          </div>
          <canvas ref={canvasRef} className="hidden" />

          {/* Controls */}
          <div className="flex flex-wrap gap-2.5 justify-center mt-4">
            {phase === 'live' && (
              <motion.button type="button" className="btn btn-primary" onClick={snap} {...tapProps}>
                <Camera size={18} strokeWidth={2.5} /> Capture
              </motion.button>
            )}
            {phase === 'captured' && (
              <>
                <motion.button type="button" className="btn" onClick={retake} {...tapProps}>
                  <RefreshCw size={18} strokeWidth={2.5} /> Retake
                </motion.button>
                <motion.button type="button" className="btn btn-success" onClick={use} {...tapProps}>
                  <Check size={18} strokeWidth={2.5} /> Use photo
                </motion.button>
              </>
            )}
            {phase === 'error' && (
              <motion.button type="button" className="btn btn-primary" onClick={() => fileRef.current?.click()} {...tapProps}>
                <ImageUp size={18} strokeWidth={2.5} /> Choose a photo
              </motion.button>
            )}
          </div>

          {/* Hidden fallback input , `capture` hints the rear camera on phones. */}
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            capture="environment"
            onChange={onFilePick}
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
          />
        </motion.div>
      </div>
    </AnimatePresence>,
    document.body,
  );
}
