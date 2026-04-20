import { db } from '@/lib/db';
import { NextResponse } from 'next/server';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const game = await db.game.update({
      where: { id },
      data: { plays: { increment: 1 } },
    });

    if (!game) {
      return NextResponse.json({ error: 'Game not found' }, { status: 404 });
    }

    return NextResponse.json({ plays: game.plays });
  } catch (error) {
    console.error('Error incrementing plays:', error);
    return NextResponse.json({ error: 'Failed to update plays' }, { status: 500 });
  }
}
