import { useState } from 'react';
import { motion } from 'framer-motion';
import { Monitor, Sun, Moon } from 'lucide-react';
import { getThemeMode, setThemeMode, THEME_MODES } from '../lib/theme.js';
import { useAuthStore } from '../store/authStore.js';

// System → Light → Dark cycle, matching the Tag UI Kit theme control.
// `variant="pill"` is the compact chip used in the sidebar / headers;
// `variant="row"` is a full-width list row for the mobile More page.
const META = {
  system: { Icon: Monitor, label: 'System' },
  light: { Icon: Sun, label: 'Light' },
  dark: { Icon: Moon, label: 'Dark' },
};

export default function ThemeToggle({ variant = 'pill' }) {
  const [mode, setMode] = useState(getThemeMode);
  const saveTheme = useAuthStore((s) => s.saveTheme);
  const { Icon, label } = META[mode];

  function cycle() {
    const next = THEME_MODES[(THEME_MODES.indexOf(mode) + 1) % THEME_MODES.length];
    setThemeMode(next);   // apply + cache locally for instant feedback
    setMode(next);
    saveTheme(next);      // sync to the account (no-op when signed out)
  }

  if (variant === 'icon') {
    return (
      <motion.button
        type="button"
        onClick={cycle}
        whileTap={{ scale: 0.95 }}
        aria-label={`Appearance: ${label}. Tap to change.`}
        title={`Appearance: ${label}`}
        className="flex-none w-10 h-10 grid place-items-center rounded-xs text-muted border border-border bg-card shadow-brutal-sm transition-colors hover:bg-surface hover:text-ink cursor-pointer"
      >
        <Icon size={18} strokeWidth={2} />
      </motion.button>
    );
  }

  if (variant === 'row') {
    return (
      <motion.button
        type="button"
        onClick={cycle}
        whileTap={{ scale: 0.98 }}
        className="flex items-center gap-[.85rem] w-full text-left px-4 py-[.9rem] border border-border rounded bg-card text-ink font-semibold text-[.95rem] shadow-brutal-sm cursor-pointer transition-colors hover:bg-surface"
      >
        <span className="flex-none w-10 h-10 grid place-items-center bg-accent-weak text-primary rounded-sm">
          <Icon size={19} strokeWidth={2} />
        </span>
        <span className="flex flex-col leading-tight flex-1 min-w-0">
          <strong>Appearance</strong>
          <small className="font-medium text-muted text-[.8rem]">{label}</small>
        </span>
      </motion.button>
    );
  }

  return (
    <motion.button
      type="button"
      onClick={cycle}
      whileTap={{ scale: 0.96 }}
      aria-label={`Theme: ${label}. Tap to change.`}
      title={`Theme: ${label}`}
      className="inline-flex items-center gap-2 bg-card text-ink border border-border-strong rounded-full font-semibold text-[.8rem] px-3 py-1.5 shadow-brutal-sm transition-colors hover:bg-surface"
    >
      <Icon size={15} strokeWidth={2} className="text-muted" />
      <span>{label}</span>
    </motion.button>
  );
}
