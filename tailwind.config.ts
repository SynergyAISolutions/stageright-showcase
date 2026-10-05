import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      // Height-aware breakpoints for the onboarding flow. Laptops are
      // width-wide (lg: kicks in) but height-short, so the biggest
      // headline + spacing land on the shortest viewports. `short:`
      // catches typical laptops (1366x768, 1440x900, 1280x800);
      // `shorter:` catches the most cramped (≤720px viewport after
      // browser chrome). Mobile portrait stays unaffected (always >820).
      screens: {
        short:   { raw: '(max-height: 820px)' },
        shorter: { raw: '(max-height: 720px)' },
      },
      colors: {
        brand: {
          navy: '#0f1d2e',
          'navy-light': '#1a2d42',
          teal: '#1a7a6d',
          'teal-light': '#23a594',
          gold: '#c9a24f',
          'gold-light': '#dbb86a',
          coral: '#d4725c',
          slate: '#64748b',
        },
        surface: {
          DEFAULT: '#ffffff',
          secondary: '#f8f9fb',
          tertiary: '#f1f3f5',
          border: '#e2e5ea',
        },
        ink: {
          DEFAULT: '#1a1a1a',
          secondary: '#4a5568',
          muted: '#94a3b8',
        },
        // Landing redesign palette (v2). Scoped to landing pages via the
        // `.landing-shell` wrapper. App surfaces continue using brand.* + ink.*
        // tokens above so dashboard / wizard / etc. are unaffected.
        sr: {
          cream:        '#F2EDE0',
          'cream-soft': '#F7F3E9',
          surface:      '#FBF8F0',
          'surface-2':  '#FCFCFA',
          ink:          '#1F3539',
          'ink-2':      '#2C4549',
          'ink-soft':   '#4F6468',
          'ink-mute':   '#7B8A8D',
          hairline:     '#D9D0BE',
          'hairline-2': '#C5BAA4',
          sage:         '#7FA08A',
          'sage-deep':  '#5A7E68',
          // Darkest sage: the only green that passes AA for TEXT on cream
          // (5.17:1). sage-deep is 4.10:1 and sage is 2.60:1, so those two are
          // graphics-only. Use this whenever a green WORD sits on cream.
          'sage-ink':   '#4A6E58',
          timber:       '#B5895A',
          'timber-deep':'#8B6840',
          terra:        '#C76F4E',
        },
      },
      fontFamily: {
        heading: ['var(--font-heading)', 'system-ui', 'sans-serif'],
        body: ['var(--font-body)', 'system-ui', 'sans-serif'],
        // Landing redesign fonts — Fraunces (display + italic accents) and
        // JetBrains Mono (spec labels, micro-copy). Loaded conditionally
        // via layout.tsx so they don't penalise the app.
        display: ['var(--font-display)', 'Georgia', 'serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      borderRadius: {
        '2xl': '1rem',
        '3xl': '1.5rem',
      },
      boxShadow: {
        'soft': '0 2px 8px rgba(15, 29, 46, 0.06)',
        'medium': '0 4px 16px rgba(15, 29, 46, 0.08)',
        'elevated': '0 8px 32px rgba(15, 29, 46, 0.12)',
      },
    },
  },
  plugins: [],
};

export default config;
