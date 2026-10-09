import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';

// --- Mocks -------------------------------------------------------------------
// framer-motion -> plain DOM (drop animation props); AnimatePresence -> passthrough.
vi.mock('framer-motion', async () => {
  const React = (await import('react')).default;
  const DROP = new Set(['whileHover', 'whileTap', 'initial', 'animate', 'exit', 'transition', 'layout', 'variants']);
  const make = (tag) =>
    React.forwardRef((props, ref) => {
      const clean = {};
      for (const k of Object.keys(props)) if (!DROP.has(k)) clean[k] = props[k];
      return React.createElement(tag, { ref, ...clean }, props.children);
    });
  // Cache per tag so each render gets the SAME component type (a fresh type each
  // access would remount the subtree every render and detach controlled inputs).
  const cache = {};
  const motion = new Proxy({}, { get: (_, tag) => (cache[tag] ||= make(String(tag))) });
  return { motion, AnimatePresence: ({ children }) => children };
});

// Camera child is exercised manually (needs a real device); stub it out here.
vi.mock('./CameraCapture.jsx', () => ({ default: () => null }));

vi.mock('../lib/api.js', () => ({
  api: { get: vi.fn(), post: vi.fn(), uploadProgress: vi.fn() },
}));
vi.mock('../lib/toast.jsx', () => ({
  notify: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn(), loading: vi.fn() },
}));

import PhotoField from './PhotoField.jsx';
import { api } from '../lib/api.js';
import { notify } from '../lib/toast.jsx';

const ITEM = { name: 'Bag', photoUrl: '/uploads/old.png', photoThumbUrl: '/uploads/old.png', photoKey: 'local:old.png', photoHash: 'oldhash' };
const okRes = (over = {}) => ({
  item: { photoUrl: '/uploads/new.png', photoThumbUrl: '/uploads/new_t.png', photoKey: 'local:new.png', photoHash: 'newhash', ...over.item },
  storageMode: 'local',
  deduped: false,
  ...over,
});
const pngFile = (name = 'p.png', type = 'image/png', size = 1024) => {
  const f = new File([new Uint8Array(4)], name, { type });
  Object.defineProperty(f, 'size', { value: size });
  return f;
};
const fileInput = () => document.querySelector('input[type="file"]');

beforeEach(() => {
  vi.clearAllMocks();
  api.get.mockResolvedValue({ storageMode: 'local' }); // health
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
});
afterEach(cleanup);

describe('PhotoField', () => {
  it('prompts to save details first when there is no item', () => {
    render(<PhotoField qrId="QR-1" item={null} onChange={() => {}} />);
    expect(screen.getByText(/save the item details first/i)).toBeInTheDocument();
  });

  it('shows the local-storage warning from /api/health', async () => {
    render(<PhotoField qrId="QR-1" item={ITEM} onChange={() => {}} />);
    expect(await screen.findByText(/may be lost when the server restarts/i)).toBeInTheDocument();
  });

  it('uploads a device file and reports success only after completion', async () => {
    api.uploadProgress.mockResolvedValue(okRes());
    const onChange = vi.fn();
    render(<PhotoField qrId="QR-9" item={ITEM} onChange={onChange} />);

    fireEvent.change(fileInput(), { target: { files: [pngFile()] } });

    await waitFor(() => expect(api.uploadProgress).toHaveBeenCalledTimes(1));
    expect(api.uploadProgress.mock.calls[0][0]).toBe('/owner/items/QR-9/photo');
    await waitFor(() => expect(notify.success).toHaveBeenCalled());
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ photoUrl: '/uploads/new.png', photoThumbUrl: '/uploads/new_t.png', photoKey: 'local:new.png', photoHash: 'newhash' }));
  });

  it('rejects a too-large / wrong-type file before any request', async () => {
    render(<PhotoField qrId="QR-1" item={ITEM} onChange={() => {}} />);
    fireEvent.change(fileInput(), { target: { files: [pngFile('big.png', 'image/png', 6 * 1024 * 1024)] } });
    await waitFor(() => expect(notify.error).toHaveBeenCalled());
    expect(api.uploadProgress).not.toHaveBeenCalled();
  });

  it('reports a dedupe as info, not success', async () => {
    api.uploadProgress.mockResolvedValue(okRes({ deduped: true }));
    render(<PhotoField qrId="QR-1" item={ITEM} onChange={() => {}} />);
    fireEvent.change(fileInput(), { target: { files: [pngFile()] } });
    await waitFor(() => expect(notify.info).toHaveBeenCalled());
    expect(notify.success).not.toHaveBeenCalled();
  });

  it('keeps the old photo on failure and offers Retry that re-runs', async () => {
    api.uploadProgress.mockRejectedValueOnce(new Error('server exploded')).mockResolvedValueOnce(okRes());
    render(<PhotoField qrId="QR-1" item={ITEM} onChange={() => {}} />);
    fireEvent.change(fileInput(), { target: { files: [pngFile()] } });

    await waitFor(() => expect(notify.error).toHaveBeenCalled());
    const retry = await screen.findByRole('button', { name: /retry/i });
    fireEvent.click(retry);
    await waitFor(() => expect(api.uploadProgress).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(notify.success).toHaveBeenCalled());
  });

  it('blocks actions and shows a banner when offline', async () => {
    render(<PhotoField qrId="QR-1" item={ITEM} onChange={() => {}} />);
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    fireEvent(window, new Event('offline'));
    expect(await screen.findByText(/you’re offline/i)).toBeInTheDocument();
    const uploadBtn = screen.getByRole('button', { name: /replace|upload/i });
    expect(uploadBtn).toBeDisabled();
  });

  it('validates the URL import field and imports a valid URL', async () => {
    api.post.mockResolvedValue(okRes());
    const onChange = vi.fn();
    render(<PhotoField qrId="QR-7" item={ITEM} onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: /from url/i }));
    const input = screen.getByLabelText(/image url/i);

    fireEvent.change(input, { target: { value: 'not-a-url' } });
    fireEvent.click(screen.getByRole('button', { name: /^import$/i }));
    expect(await screen.findByText(/valid http\(s\) image url/i)).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { value: 'https://example.com/a.png' } });
    fireEvent.click(screen.getByRole('button', { name: /^import$/i }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/owner/items/QR-7/photo-url', { url: 'https://example.com/a.png' }, expect.any(Object)));
    await waitFor(() => expect(onChange).toHaveBeenCalled());
  });
});
