import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const here = path.dirname(fileURLToPath(import.meta.url));

// SPA cong dong. Ket qua build di thang vao dist/public/ o goc repo, cung cho
// voi trang ban hang (dist/public/f/) - Worker phuc vu ca hai tu mot binding ASSETS.
export default defineConfig({
  root: here,
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(here, 'src') },
  },
  build: {
    outDir: path.resolve(here, '../../dist/public'),
    // KHONG duoc de Vite xoa sach dist/public: thu muc do dung CHUNG voi trang
    // ban hang (f/, xem-truoc/). Bat emptyOutDir thi chay `npm run build:web`
    // rieng se thoi bay toan bo trang ban hang, va test funnel do 10 bai voi
    // ly do hoan toan khong lien quan. Vite chi don phan cua chinh no ben duoi.
    emptyOutDir: false,
    sourcemap: true,
  },
  server: {
    port: 5173,
    // Khi chay o may: vite giu SPA, wrangler dev giu API o cong 8787.
    proxy: {
      '/api': { target: 'http://127.0.0.1:8787', changeOrigin: false },
      '/files': { target: 'http://127.0.0.1:8787', changeOrigin: false },
    },
  },
});
