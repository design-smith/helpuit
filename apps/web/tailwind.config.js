/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Operator-console palette: calm slate canvas, one indigo accent,
        // status hues used only on badges.
        canvas: '#0b0f17',
        surface: '#121826',
        'surface-2': '#1a2234',
        border: '#283145',
        muted: '#8a94a7',
        ink: '#e6eaf2',
        accent: '#6366f1',
        'accent-soft': '#312e81',
      },
      fontFamily: {
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
    },
  },
  plugins: [],
}
