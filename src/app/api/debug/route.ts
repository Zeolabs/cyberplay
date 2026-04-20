import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET() {
  const dbUrl = process.env.DATABASE_URL || '';
  const tursoUrl = process.env.TURSO_DATABASE_URL || '';
  const hasToken = !!process.env.TURSO_AUTH_TOKEN;
  const nodeEnv = process.env.NODE_ENV;

  // Test actual database connection
  let dbTest = { success: false, gameCount: 0, sourceCount: 0, error: '' };

  try {
    const gameCount = await db.game.count();
    const sourceCount = await db.gameSource.count();
    dbTest = { success: true, gameCount, sourceCount, error: '' };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    dbTest = { success: false, gameCount: 0, sourceCount: 0, error: message };
  }

  return NextResponse.json({
    database_url_prefix: dbUrl.substring(0, 30) + (dbUrl.length > 30 ? '...' : ''),
    turso_database_url_prefix: tursoUrl.substring(0, 30) + (tursoUrl.length > 30 ? '...' : ''),
    turso_database_url_set: !!tursoUrl,
    turso_token_set: hasToken,
    node_env: nodeEnv,
    all_env_keys: Object.keys(process.env).filter(k =>
      k.includes('DATABASE') || k.includes('TURSO') || k.includes('PRISMA') || k.includes('NODE')
    ),
    db_test: dbTest,
  });
}
