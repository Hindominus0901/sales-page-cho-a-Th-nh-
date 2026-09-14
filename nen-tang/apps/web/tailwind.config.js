import animate from 'tailwindcss-animate';

/** @type {import('tailwindcss').Config} */
// Mau va font deu doc tu bien CSS trong src/index.css, khong hardcode o day -
// doi thuong hieu chi can sua index.css.
const hsl = (name) => `hsl(var(--${name}) / <alpha-value>)`;

export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    container: {
      center: true,
      padding: '1rem',
      screens: { '2xl': '1400px' },
    },
    extend: {
      colors: {
        border: hsl('border'),
        input: hsl('input'),
        ring: hsl('ring'),
        background: hsl('background'),
        foreground: hsl('foreground'),
        primary: { DEFAULT: hsl('primary'), foreground: hsl('primary-foreground') },
        secondary: { DEFAULT: hsl('secondary'), foreground: hsl('secondary-foreground') },
        destructive: { DEFAULT: hsl('destructive'), foreground: hsl('destructive-foreground') },
        muted: { DEFAULT: hsl('muted'), foreground: hsl('muted-foreground') },
        accent: { DEFAULT: hsl('accent'), foreground: hsl('accent-foreground') },
        popover: { DEFAULT: hsl('popover'), foreground: hsl('popover-foreground') },
        card: { DEFAULT: hsl('card'), foreground: hsl('card-foreground') },
        chart: {
          1: hsl('chart-1'), 2: hsl('chart-2'), 3: hsl('chart-3'),
          4: hsl('chart-4'), 5: hsl('chart-5'),
        },
        brand: {
          gold: hsl('brand-gold'),
          silver: hsl('brand-silver'),
          bronze: hsl('brand-bronze'),
        },
        sidebar: {
          DEFAULT: hsl('sidebar-background'),
          foreground: hsl('sidebar-foreground'),
          primary: hsl('sidebar-primary'),
          'primary-foreground': hsl('sidebar-primary-foreground'),
          accent: hsl('sidebar-accent'),
          'accent-foreground': hsl('sidebar-accent-foreground'),
          border: hsl('sidebar-border'),
          ring: hsl('sidebar-ring'),
        },
      },
      fontFamily: {
        heading: 'var(--font-heading)',
        body: 'var(--font-body)',
        display: 'var(--font-display)',
        mono: 'var(--font-mono)',
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
      },
    },
  },
  plugins: [animate],
};
