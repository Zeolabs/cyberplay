import { NextResponse } from 'next/server';
import { fetchGamesFromSource, getProgress } from '@/lib/game-fetcher';
import { db } from '@/lib/db';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const source = await db.gameSource.findUnique({ where: { id } });
    if (!source) {
      return NextResponse.json({ error: 'Source not found' }, { status: 404 });
    }

    // Run fetch in background (don't await - fire and return progress endpoint)
    fetchGamesFromSource(id).catch(err => {
      console.error(`Background fetch failed for ${id}:`, err);
    });

    return NextResponse.json({
      message: `Fetching games from ${source.name}...`,
      progressUrl: `/api/sources/${id}/fetch`,
    });
  } catch (error) {
    console.error('Error starting fetch:', error);
    return NextResponse.json({ error: 'Failed to start fetch' }, { status: 500 });
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const progress = getProgress(id);
    return NextResponse.json(progress);
  } catch (error) {
    console.error('Error getting progress:', error);
    return NextResponse.json({ error: 'Failed to get progress' }, { status: 500 });
  }
}
