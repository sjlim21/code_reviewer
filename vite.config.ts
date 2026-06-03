import { defineConfig, mergeConfig } from 'vite'
import { defineConfig as defineTestConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from "path"
import { fileURLToPath } from "url"

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const viteConfig = defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
})

const testConfig = defineTestConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    css: false,
  },
})

// https://vite.dev/config/
export default mergeConfig(viteConfig, testConfig)

