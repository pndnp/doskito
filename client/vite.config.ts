import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    fs: { allow: ['..'] },
    port: 5173,
    strictPort: true,
    allowedHosts: ['client', 'localhost', '127.0.0.1'],
    watch: { usePolling: true },
    proxy: {
      '/api': { target: process.env.VITE_PROXY_TARGET ?? 'http://localhost:3001' },
    },
  },
});
