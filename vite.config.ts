import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  const target = env.API_PROXY_TARGET?.trim();
  if (target && !/^https?:\/\//.test(target))
    throw new Error('API_PROXY_TARGET은 HTTP(S) 주소여야 합니다.');
  return {
    plugins: [react()],
    base: './',
    server: {
      host: '127.0.0.1',
      port: 5173,
      strictPort: true,
      ...(target
        ? { proxy: { '/api/v1': { target, changeOrigin: true } } }
        : {}),
    },
    preview: { host: '127.0.0.1', port: 4173, strictPort: true },
  };
});
