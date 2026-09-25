import type { Config } from 'tailwindcss';

/** Only design tokens (CSS variables from palette_show frost-01 + tokens-fx.css) — no raw values in components. */
const v = (name: string) => `var(--${name})`;
const roles = ['like', 'dislike', 'ui', 'ai', 'mcp', 'service', 'enrich', 'net'];

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      screens: { '3xl': '1920px' },
      colors: {
        bg: v('color-bg'),
        'bg-deep': v('color-bg-deep'),
        surface: v('color-surface'),
        'surface-2': v('color-surface-2'),
        text: v('color-text'),
        'text-2': v('color-text-secondary'),
        muted: v('color-muted'),
        'muted-strong': v('color-muted-strong'),
        'muted-dim': v('color-muted-dim'),
        border: v('color-border'),
        'border-strong': v('color-border-strong'),
        accent: v('color-accent'),
        'accent-bright': v('color-accent-bright'),
        'accent-deep': v('color-accent-deep'),
        'accent-soft': v('color-accent-soft'),
        'accent-contrast': v('color-accent-contrast'),
        danger: v('color-danger'),
        success: v('color-success'),
        ink: v('color-ink'),
        'ink-2': v('color-ink-2'),
        'ink-3': v('color-ink-3'),
        'ink-border': v('color-ink-border'),
        'on-deep': v('color-on-deep'),
        'on-deep-2': v('color-on-deep-secondary'),
        'on-deep-muted': v('color-on-deep-muted'),
        ...Object.fromEntries(
          roles.flatMap((r) => [
            [r, v(`role-${r}`)],
            [`${r}-soft`, v(`role-${r}-soft`)],
            [`${r}-ink`, v(`role-${r}-ink`)],
          ]),
        ),
      },
      fontFamily: {
        heading: v('font-heading'),
        sans: v('font-body'),
        mono: v('font-mono'),
      },
      fontSize: {
        display: [v('text-display'), { lineHeight: v('leading-tight') }],
        h1: [v('text-h1'), { lineHeight: v('leading-tight') }],
        h2: [v('text-h2'), { lineHeight: '1.12' }],
        h3: [v('text-h3'), { lineHeight: '1.25' }],
        lead: [v('text-lead'), { lineHeight: '1.5' }],
        body: [v('text-body'), { lineHeight: v('leading-normal') }],
        caption: [v('text-caption'), { lineHeight: '1.45' }],
      },
      letterSpacing: { heading: v('tracking-heading'), eyebrow: v('tracking-eyebrow') },
      borderRadius: {
        sm: v('radius-sm'),
        md: v('radius-md'),
        lg: v('radius-lg'),
        full: v('radius-full'),
        card: v('radius-card'),
      },
      boxShadow: {
        sm: v('shadow-sm'),
        md: v('shadow-md'),
        lg: v('shadow-lg'),
        accent: v('shadow-accent'),
      },
      spacing: {
        sm: v('space-sm'),
        md: v('space-md'),
        lg: v('space-lg'),
        xl: v('space-xl'),
        gutter: v('gutter'),
      },
      maxWidth: {
        text: '38rem',
        modal: '48rem',
        toast: '24rem',
        form: '28rem',
      },
      transitionTimingFunction: { brand: v('motion-easing') },
      transitionDuration: { brand: v('motion-duration') },
    },
  },
} satisfies Config;
