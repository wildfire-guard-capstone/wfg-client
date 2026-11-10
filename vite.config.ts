import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const target = loadEnv(
    mode,
    '.',
    'API_PROXY_TARGET',
  ).API_PROXY_TARGET?.trim();
  if (target) {
    const url = new URL(target);
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== '/'
    ) {
      throw new Error(
        'API_PROXY_TARGET은 인증 정보·경로가 없는 HTTP(S) origin이어야 합니다.',
      );
    }
  }
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
