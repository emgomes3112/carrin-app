import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    env: {
      DATABASE_URL: 'postgresql://johndoe:randompassword@localhost:5432/mydb?schema=public',
      JWT_SECRET: 'test-secret',
    }
  }
})
