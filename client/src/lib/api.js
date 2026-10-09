import { API_BASE } from './config.js';

const TOKEN_KEY = 'lf_token';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(t) {
  if (t) localStorage.setItem(TOKEN_KEY, t);
  else localStorage.removeItem(TOKEN_KEY);
}

// The auth store registers a callback here so an authed request that comes back
// 401/403 (expired token, disabled/deleted account) clears the session once,
// centrally, instead of every caller having to handle it.
let onUnauthorized = null;
export function setOnUnauthorized(fn) {
  onUnauthorized = fn;
}

async function request(method, path, { body, auth = true, form, signal } = {}) {
  const headers = {};
  if (auth) {
    const t = getToken();
    if (t) headers.Authorization = `Bearer ${t}`;
  }
  let payload;
  if (form) {
    payload = form; // FormData; let the browser set the content-type/boundary
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  let res;
  try {
    res = await fetch(API_BASE + '/api' + path, { method, headers, body: payload, signal });
  } catch (e) {
    // Abort (user cancel) and network failures (offline) both land here.
    if (e.name === 'AbortError') throw Object.assign(new Error('Cancelled'), { aborted: true, status: 'ABORT' });
    throw Object.assign(new Error('Network error — check your connection and try again'), { status: 0 });
  }
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!res.ok) {
    // Session died (expired/disabled/deleted) on a request we sent authenticated.
    if (auth && (res.status === 401 || res.status === 403)) {
      setToken(null);
      if (onUnauthorized) onUnauthorized();
    }
    const err = new Error((data && data.error) || `Request failed (${res.status})`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

// Multipart POST with real upload-progress + cancellation, which fetch() can't
// report. Used for photo uploads so the UI can show a progress bar and a working
// Cancel button. `onProgress` gets a 0..1 fraction; `signal` is an AbortSignal.
function uploadWithProgress(path, form, { onProgress, signal } = {}) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', API_BASE + '/api' + path);
    const t = getToken();
    if (t) xhr.setRequestHeader('Authorization', `Bearer ${t}`);

    const abortErr = () => Object.assign(new Error('Cancelled'), { aborted: true, status: 'ABORT' });
    if (signal) {
      if (signal.aborted) {
        reject(abortErr());
        return;
      }
      signal.addEventListener('abort', () => xhr.abort(), { once: true });
    }

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => {
      let data = null;
      try {
        data = xhr.responseText ? JSON.parse(xhr.responseText) : null;
      } catch {
        data = null;
      }
      if (xhr.status >= 200 && xhr.status < 300) return resolve(data);
      if (xhr.status === 401 || xhr.status === 403) {
        setToken(null);
        if (onUnauthorized) onUnauthorized();
      }
      const err = new Error((data && data.error) || `Request failed (${xhr.status})`);
      err.status = xhr.status;
      err.data = data;
      reject(err);
    };
    xhr.onerror = () => reject(Object.assign(new Error('Network error — check your connection and try again'), { status: 0 }));
    xhr.ontimeout = () => reject(Object.assign(new Error('Upload timed out — try again'), { status: 0 }));
    xhr.onabort = () => reject(abortErr());
    xhr.send(form);
  });
}

export const api = {
  get: (p, o) => request('GET', p, o),
  post: (p, body, o) => request('POST', p, { ...o, body }),
  put: (p, body, o) => request('PUT', p, { ...o, body }),
  del: (p, o) => request('DELETE', p, o),
  upload: (p, form) => request('POST', p, { form }),
  uploadProgress: uploadWithProgress,
};
