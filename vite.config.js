import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: './', // Necessário para o GitHub Pages achar os arquivos
  plugins: [react()]
})
