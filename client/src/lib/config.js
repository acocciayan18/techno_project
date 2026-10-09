// Base URL of the Express API.
//
// Dev: left empty so requests stay relative ('/api/...', '/uploads/...') and the
// Vite proxy (vite.config.js) forwards them to http://localhost:4000.
// Prod: set VITE_API_BASE_URL to the deployed backend origin (e.g. the Render URL)
// at build time, so the Vercel-hosted frontend calls the backend cross-origin
// instead of hitting its own domain and 404ing.
export const API_BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');

// Build a full URL for an API/same-origin path ('/api/...', '/uploads/...').
export function apiUrl(path) {
  return API_BASE + path;
}

// Resolve a server-provided asset URL for use as an <img> src.
// Absolute URLs (Cloudinary, Firebase) pass through untouched; relative ones
// (local-disk '/uploads/...' fallback) get the API base prepended.
export function assetUrl(url) {
  if (!url) return url;
  if (/^(https?:|data:|blob:)/i.test(url)) return url;
  return API_BASE + url;
}
