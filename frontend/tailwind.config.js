/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        nexus: {
          bg: '#091019',
          panel: '#0f1a28',
          ink: '#dbe8ff',
          accent: '#38bdf8',
          good: '#22c55e',
          warn: '#f59e0b',
          danger: '#ef4444'
        },
        "surface": "#0c0e13",
        "on-primary": "#005762",
        "error": "#ff716c",
        "surface-container-lowest": "#000000",
        "tertiary-fixed": "#c0a0ff",
        "on-error": "#490006",
        "primary-fixed": "#00e3fd",
        "on-primary-fixed": "#003840",
        "on-tertiary-fixed": "#200051",
        "inverse-surface": "#f9f9ff",
        "on-secondary-container": "#e9cdff",
        "inverse-primary": "#006976",
        "on-surface": "#f3f3fb",
        "surface-container": "#171a20",
        "on-tertiary-fixed-variant": "#4a00a4",
        "error-container": "#9f0519",
        "background": "#0c0e13",
        "on-surface-variant": "#aaabb2",
        "surface-container-high": "#1d2026",
        "on-primary-container": "#004d57",
        "on-tertiary": "#2b0065",
        "error-dim": "#d7383b",
        "secondary-dim": "#9c48ea",
        "primary-container": "#00e3fd",
        "secondary-fixed-dim": "#dbb4ff",
        "on-secondary-fixed": "#4f0089",
        "primary": "#00E5FF",
        "tertiary-container": "#8342f4",
        "tertiary-fixed-dim": "#b48fff",
        "outline-variant": "#46484e",
        "on-secondary-fixed-variant": "#7511c3",
        "secondary": "#c180ff",
        "outline": "#74757c",
        "secondary-container": "#6f00be",
        "tertiary-dim": "#8a4cfc",
        "surface-variant": "#23262d",
        "primary-dim": "#00d4ec",
        "on-primary-fixed-variant": "#005762",
        "on-error-container": "#ffa8a3",
        "primary-fixed-dim": "#00d4ec",
        "secondary-fixed": "#e5c6ff",
        "on-background": "#f3f3fb",
        "surface-container-highest": "#23262d",
        "tertiary": "#af88ff",
        "on-tertiary-container": "#ffffff",
        "surface-bright": "#292c34",
        "on-secondary": "#33005b",
        "inverse-on-surface": "#53555b",
        "surface-tint": "#00E5FF",
        "surface-container-low": "#111319",
        "surface-dim": "#0c0e13"
      },
      borderRadius: {
        "card": "1.5rem"
      },
      fontFamily: {
        "headline": ["Space Grotesk", "sans-serif"],
        "body": ["Inter", "sans-serif"],
        "label": ["Inter", "sans-serif"]
      }
    }
  },
  plugins: [],
};
