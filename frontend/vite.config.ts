import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
// GitHub project Pages serves this repo at /pulse-mint/ (gh-pages branch).
export default defineConfig({ base: '/pulse-mint/', plugins: [react()] });
