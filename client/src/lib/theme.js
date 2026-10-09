// Theme mode persistence + application. Three modes cycle in the UI:
//   'system' (follow OS, default) · 'light' · 'dark'.
// Only 'light'/'dark' set [data-theme] on <html>; 'system' clears it so the
// prefers-color-scheme media query in index.css takes over. The initial apply
// also runs inline in index.html to prevent a flash before React mounts.
const KEY = 'qrlf-theme';
export const THEME_MODES = ['system', 'light', 'dark'];

export function getThemeMode() {
  try {
    const m = localStorage.getItem(KEY);
    return THEME_MODES.includes(m) ? m : 'system';
  } catch {
    return 'system';
  }
}

export function applyThemeMode(mode) {
  const root = document.documentElement;
  if (mode === 'light' || mode === 'dark') root.setAttribute('data-theme', mode);
  else root.removeAttribute('data-theme');
}

export function setThemeMode(mode) {
  try { localStorage.setItem(KEY, mode); } catch { /* storage may be blocked */ }
  applyThemeMode(mode);
}
