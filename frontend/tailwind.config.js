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
        }
      }
    }
  },
  plugins: [],
};
