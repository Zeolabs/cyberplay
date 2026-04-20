import { NextResponse } from 'next/server';

export async function GET() {
  const dbUrl = process.env.DATABASE_URL || '';
  const hasToken = !!process.env.TURSO_AUTH_TOKEN;
  const nodeEnv = process.env.NODE_ENV;

  return NextResponse.json({
    database_url_prefix: dbUrl.substring(0, 30) + (dbUrl.length > 30 ? '...' : ''),
    database_url_length: dbUrl.length,
    turso_token_set: hasToken,
    turso_token_length: process.env.TURSO_AUTH_TOKEN?.length || 0,
    node_env: nodeEnv,
    all_env_keys: Object.keys(process.env).filter(k =>
      k.includes('DATABASE') || k.includes('TURSO') || k.includes('PRISMA') || k.includes('NODE')
    ),
  });
}
