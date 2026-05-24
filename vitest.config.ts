import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node'
  },
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'src/renderer/src/shared'),
      '@renderer': resolve(__dirname, 'src/renderer/src')
    }
  }
})
