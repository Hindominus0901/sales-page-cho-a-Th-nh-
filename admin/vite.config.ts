import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/** SPA quản trị build ra public/admin/, Worker phục vụ ở /admin. */
export default defineConfig({
  root: 'admin',
  base: '/admin/',
  plugins: [react()],
  build: {
    outDir: '../public/admin',
    emptyOutDir: true,
  },
});
