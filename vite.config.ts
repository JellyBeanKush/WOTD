
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, (process as any).cwd(), '');
  return {
    plugins: [react()],
    define: {
      // Fix: Check for both API_KEY and GEMINI_API_KEY to match your .env file
      'process.env.API_KEY': JSON.stringify(env.API_KEY || env.GEMINI_API_KEY)
    },
    server: {
        port: 3000,
        // Force IPv4 (127.0.0.1) for reliable Windows connection
        host: '127.0.0.1'
    }
  };
});
