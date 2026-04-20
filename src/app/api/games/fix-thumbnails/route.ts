import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

// One-time fix: clear broken thumbnail URLs
export async function POST() {
  try {
    const brokenGames = await db.game.findMany({
      where: {
        thumbnailUrl: { contains: 'images.crazygames.com' },
      },
    });

    for (const game of brokenGames) {
      await db.game.update({
        where: { id: game.id },
        data: { thumbnailUrl: '' },
      });
    }

    return NextResponse.json({
      fixed: brokenGames.length,
      message: `Cleared ${brokenGames.length} broken thumbnail URLs.`,
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fix thumbnails' },
      { status: 500 },
    );
  }
}
