import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [react(), tailwindcss()],
    define: {
      'import.meta.env.VITE_PAYFAST_SANDBOX': JSON.stringify(env.VITE_PAYFAST_SANDBOX || 'true'),
      'import.meta.env.VITE_DEV_MODE': JSON.stringify(env.VITE_DEV_MODE || 'false'),
      'import.meta.env.VITE_APP_URL': JSON.stringify(env.VITE_APP_URL || env.APP_URL || ''),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // Escape hatch for environments where file watching causes flickering
      // (agent-driven editing, some container filesystems): set DISABLE_HMR=true.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
