import tailwindcssAnimate from 'tailwindcss-animate'

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Neobrutalism tokens — bound to the CSS vars in index.css (the vendored
        // components use bg-main / border-border / bg-secondary-background / etc.).
        main: 'var(--main)',
        'main-foreground': 'var(--main-foreground)',
        background: 'var(--background)',
        'secondary-background': 'var(--secondary-background)',
        foreground: 'var(--foreground)',
        border: 'var(--border)',
        overlay: 'var(--overlay)',
        ring: 'var(--ring)',
        'chart-1': 'var(--chart-1)',
        'chart-2': 'var(--chart-2)',
        'chart-3': 'var(--chart-3)',
        'chart-4': 'var(--chart-4)',
        'chart-5': 'var(--chart-5)',
        // Legacy console token names, remapped to the neobrutalism (light) palette so
        // app chrome (AppShell, Login, NotFound) and page text flip automatically.
        canvas: 'var(--background)',
        surface: 'var(--secondary-background)',
        'surface-2': '#e6e6e6',
        ink: 'var(--foreground)',
        muted: '#5c5c5c',
        accent: 'var(--main)',
        'accent-soft': '#b8ccf2',
      },
      borderRadius: { base: 'var(--border-radius)' },
      boxShadow: { shadow: 'var(--shadow)', nav: '4px 4px 0px 0px var(--border)' },
      // Used by the vendored components' hover translate (translate-x-boxShadowX, …).
      spacing: {
        boxShadowX: 'var(--box-shadow-x)',
        boxShadowY: 'var(--box-shadow-y)',
        reverseBoxShadowX: 'var(--reverse-box-shadow-x)',
        reverseBoxShadowY: 'var(--reverse-box-shadow-y)',
      },
      fontWeight: { base: 'var(--base-font-weight)', heading: 'var(--heading-font-weight)' },
      fontFamily: { mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'] },
    },
  },
  plugins: [tailwindcssAnimate],
}
