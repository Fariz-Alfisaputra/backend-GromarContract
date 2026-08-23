import dotenv from 'dotenv'
import path from 'path'
import { defineConfig } from 'prisma/config'

// Force load the local .env file
dotenv.config({ path: path.resolve(__dirname, '.env'), override: true })

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/postgres'

export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: DATABASE_URL,
  },
})
