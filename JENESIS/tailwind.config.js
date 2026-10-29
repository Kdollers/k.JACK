/** @type {import('tailwindcss').Config} */
const withOpacity = (variable) => `rgb(var(${variable}) / <alpha-value>)`;

export default {
  // Themes are switched by putting `dark` on <html> (see src/theme.mjs), so
  // Tailwind's `dark:` variant works alongside the theme tokens.
  darkMode: 'class',
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // Semantic tokens. New screens should use these instead of raw palette
        // shades: they follow the active theme automatically.
        canvas: withOpacity('--j-canvas'),
        surface: withOpacity('--j-surface'),
        'surface-muted': withOpacity('--j-surface-muted'),
        'surface-hover': withOpacity('--j-surface-hover'),
        line: withOpacity('--j-line'),
        'line-strong': withOpacity('--j-line-strong'),
        ink: {
          DEFAULT: withOpacity('--j-ink'),
          secondary: withOpacity('--j-ink-secondary'),
          muted: withOpacity('--j-ink-muted'),
          subtle: withOpacity('--j-ink-subtle'),
        },
        shell: {
          DEFAULT: withOpacity('--j-shell'),
          line: withOpacity('--j-shell-line'),
          ink: withOpacity('--j-shell-ink'),
          muted: withOpacity('--j-shell-muted'),
        },
        brand: {
          DEFAULT: withOpacity('--j-brand'),
          strong: withOpacity('--j-brand-strong'),
        },
        genesis: {
          50: '#f0f5ff',
          100: '#e5edff',
          200: '#cddbfe',
          300: '#b4c6fc',
          400: '#8da2fb',
          500: '#6875f5',
          600: '#5850ec',
          700: '#4c42d3',
          800: '#3f36a8',
          900: '#322b7a',
          950: '#1e1a47',
        },
        // Used by the sidebar's active row; was referenced before it existed.
        slate: {
          750: '#293548',
        },
      },
      keyframes: {
        'fade-in': {
          '0%': { opacity: '0', transform: 'translateY(4px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.18s ease-out',
      },
    },
  },
  plugins: [],
};
