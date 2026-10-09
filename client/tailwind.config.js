/** @type {import('tailwindcss').Config} */
// Tag UI Kit tokens — one cobalt accent, soft surfaces, hairline borders, blurred
// shadows. Colors are CSS variables holding "R G B" channel triplets so the whole
// palette flips for dark mode (see index.css :root / [data-theme]) while Tailwind
// opacity modifiers (bg-card/90, border-ink/90…) still work. Shadows are variables
// too so elevation darkens in dark mode. The brutal-* names are kept so existing
// classes map cleanly — they are soft, not hard offsets.
const rgb = (v) => `rgb(var(${v}) / <alpha-value>)`;

export default {
  darkMode: ['selector', '[data-theme="dark"]'],
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        bg: rgb('--bg'),                       // page background
        surface: rgb('--surface'),             // subtle grey fill
        'muted-bg': rgb('--surface-3'),        // slightly stronger fill
        card: rgb('--card'),                   // raised surface
        ink: rgb('--ink'),                     // primary text
        muted: rgb('--muted'),
        'muted-2': rgb('--muted-2'),
        border: rgb('--border'),               // hairline border
        'border-strong': rgb('--border-strong'),
        primary: rgb('--primary'),             // cobalt accent — carries every action
        'primary-ink': rgb('--primary-ink'),
        'primary-hover': rgb('--primary-hover'),
        accent: rgb('--primary'),              // alias of primary (legacy usages)
        'accent-weak': rgb('--accent-weak'),   // accent tint for chips / soft fills
        success: rgb('--success'),
        'success-weak': rgb('--success-weak'),
        danger: rgb('--danger'),
        'danger-weak': rgb('--danger-weak'),
        warn: rgb('--warn'),
        'warn-weak': rgb('--warn-weak'),
        info: rgb('--info'),
        'info-weak': rgb('--info-weak'),
        // legacy soft tints kept as gentle neutrals so stray usages still read
        'green-soft': rgb('--success-weak'),
        'yellow-soft': rgb('--warn-weak'),
      },
      fontFamily: {
        sans: ['Figtree', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        display: ['"Bricolage Grotesque"', 'Figtree', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'Menlo', 'Consolas', 'monospace'],
      },
      borderRadius: {
        DEFAULT: '13px',
        sm: '10px',
        xs: '7px',
        lg: '18px',
      },
      borderWidth: {
        DEFAULT: '1px',
        3: '3px',
      },
      boxShadow: {
        // Soft, blurred elevation (var-driven so it deepens in dark mode).
        'brutal-sm': 'var(--sh-sm)',
        brutal: 'var(--sh)',
        'brutal-lg': 'var(--sh-lg)',
        card: 'var(--sh-sm)',
        pop: 'var(--sh)',
        none: '0 0 0 transparent',
      },
      maxWidth: {
        app: '1040px',
      },
      spacing: {
        sidebar: '240px',
      },
      ringColor: {
        DEFAULT: 'rgb(var(--accent-weak))',
      },
    },
  },
  plugins: [],
};
