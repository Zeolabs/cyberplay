import { PrismaClient } from '@prisma/client'
import { PrismaLibSQL } from '@prisma/adapter-libsql'
import { createClient } from '@libsql/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

function createPrismaClient(): PrismaClient {
  const databaseUrl = process.env.DATABASE_URL || ''

  console.log('[db] DATABASE_URL prefix:', databaseUrl.substring(0, 20) + '...')
  console.log('[db] TURSO_AUTH_TOKEN set:', !!process.env.TURSO_AUTH_TOKEN)
  console.log('[db] NODE_ENV:', process.env.NODE_ENV)

  // Use libSQL adapter when connecting to Turso (libsql:// URL)
  if (databaseUrl.startsWith('libsql://')) {
    console.log('[db] Using Turso/libSQL adapter')
    try {
      const libsql = createClient({
        url: databaseUrl,
        authToken: process.env.TURSO_AUTH_TOKEN,
      })
      const adapter = new PrismaLibSQL(libsql)
      const client = new PrismaClient({
        adapter,
        log: ['error'],
      })
      return client
    } catch (err) {
      console.error('[db] Failed to create libSQL adapter:', err)
      throw err
    }
  }

  // Local SQLite for development
  console.log('[db] Using local SQLite')
  return new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query'] : ['error'],
  })
}

export const db = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
