import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return;

          if (id.includes('jspdf')) {
            return 'vendor-jspdf';
          }
          if (id.includes('html2canvas')) {
            return 'vendor-html2canvas';
          }
          if (id.includes('@xyflow')) {
            return 'vendor-xyflow';
          }
          if (id.includes('framer-motion')) {
            return 'vendor-motion';
          }
          if (id.includes('dompurify')) {
            return 'vendor-dompurify';
          }
          if (
            id.includes('/react/') ||
            id.includes('/react-dom/') ||
            id.includes('/scheduler/')
          ) {
            return 'vendor-react';
          }
          if (
            id.includes('react-markdown') ||
            id.includes('remark-') ||
            id.includes('rehype-') ||
            id.includes('unified') ||
            id.includes('micromark') ||
            id.includes('mdast-util') ||
            id.includes('hast-util') ||
            id.includes('unist-util') ||
            id.includes('property-information') ||
            id.includes('vfile')
          ) {
            return 'vendor-markdown';
          }
          if (
            id.includes('canvg') ||
            id.includes('stackblur-canvas') ||
            id.includes('fast-png') ||
            id.includes('svg-pathdata') ||
            id.includes('pako') ||
            id.includes('fflate') ||
            id.includes('rgbcolor')
          ) {
            return 'vendor-canvas';
          }

          return 'vendor-misc';
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{js,jsx,ts,tsx}'],
    exclude: ['e2e/**'],
  },
});
