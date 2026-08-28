/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        accent: "#2E5FD9",
        ink: "#0F172A",
        muted: "#64748B",
        ok: "#16A34A",
        warn: "#D97706",
        crit: "#DC2626",
        "dark-bg": "#0B1220",
      },
      fontFamily: {
        sans: ["Plus Jakarta Sans", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
}