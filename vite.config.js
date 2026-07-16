import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: './', // relative asset paths: dist/ works double-clicked or hosted anywhere
  plugins: [react()],
});
