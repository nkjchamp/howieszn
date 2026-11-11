import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const apiTarget = process.env.HOWIESZN_API_TARGET ?? 'http://127.0.0.1:4000';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': { target: apiTarget, changeOrigin: true },
      '/events': { target: apiTarget.replace(/^http/, 'ws'), ws: true },
    },
  },
});
