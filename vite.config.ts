import { defineConfig } from 'vite';

export default defineConfig({
  base: '/Space-Ship-Network/',
  server: {
    port: 3000,
    proxy: {
      '/api/dify-chat': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
});
