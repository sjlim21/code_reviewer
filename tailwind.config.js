/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        slate: {
          950: "var(--color-slate-950, #0b0f19)",
        },
        'bg-primary': "var(--bg-primary, #080c14)",
        'bg-secondary': "var(--bg-secondary, #0f1624)",
        'bg-tertiary': "var(--bg-tertiary, #162033)",
        'border-color': "var(--border-color, rgba(38, 51, 74, 0.5))",
        'border-hover': "var(--border-hover, rgba(99, 102, 241, 0.4))",
        'glow-indigo': "var(--glow-indigo, rgba(99, 102, 241, 0.15))",
        'glow-cyan': "var(--glow-cyan, rgba(6, 182, 212, 0.15))",
      },
      fontFamily: {
        sans: ["var(--font-sans, 'Outfit', sans-serif)"],
        mono: ["var(--font-mono, 'JetBrains Mono', monospace)"],
      }
    },
  },
  plugins: [],
}

