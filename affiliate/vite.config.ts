import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/** Portal cộng tác viên build ra public/aff/, Worker phục vụ ở /aff. */
export default defineConfig({
  root: 'affiliate',
  base: '/aff/',
  plugins: [react()],
  build: {
    outDir: '../public/aff',
    emptyOutDir: true,
  },
});
