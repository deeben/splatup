import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 2000,
  },
  server: {
    // Keep the large sample scans out of the file watcher.
    watch: { ignored: ['**/FBX/**', '**/GLB/**', '**/LAS/**', '**/PLY/**'] },
  },
});
