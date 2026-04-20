import { PrismaClient } from '@prisma/client'
import { PrismaLibSQL } from '@prisma/adapter-libsql'
import { createClient } from '@libsql/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

function createPrismaClient(): PrismaClient {
  // On Vercel/Turso: use TURSO_DATABASE_URL for the adapter,
  // while DATABASE_URL stays as a dummy file: URL for schema validation
  const tursoUrl = process.env.TURSO_DATABASE_URL
  const tursoToken = process.env.TURSO_AUTH_TOKEN
  const databaseUrl = process.env.DATABASE_URL || ''

  console.log('[db] DATABASE_URL prefix:', databaseUrl.substring(0, 20) + '...')
  console.log('[db] TURSO_DATABASE_URL set:', !!tursoUrl)
  console.log('[db] TURSO_AUTH_TOKEN set:', !!tursoToken)
  console.log('[db] NODE_ENV:', process.env.NODE_ENV)

  // Use libSQL adapter when TURSO_DATABASE_URL is set (production/Vercel)
  if (tursoUrl && tursoUrl.startsWith('libsql://')) {
    console.log('[db] Using Turso/libSQL adapter')
    try {
      const libsql = createClient({
        url: tursoUrl,
        authToken: tursoToken,
      })
      const adapter = new PrismaLibSQL(libsql)
      return new PrismaClient({
        adapter,
        log: ['error'],
      })
    } catch (err) {
      console.error('[db] Failed to create libSQL adapter:', err)
      throw err
    }
  }

  // Local SQLite for development
  console.log('[db] Using local SQLite, DATABASE_URL:', databaseUrl)
  return new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query'] : ['error'],
  })
}

export const db = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
