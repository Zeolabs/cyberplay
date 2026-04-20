import { db } from '@/lib/db';
import { NextResponse } from 'next/server';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const game = await db.game.findUnique({
      where: { id },
    });

    if (!game) {
      return NextResponse.json({ error: 'Game not found' }, { status: 404 });
    }

    return NextResponse.json(game);
  } catch (error) {
    console.error('Error fetching game:', error);
    return NextResponse.json({ error: 'Failed to fetch game' }, { status: 500 });
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { title, description, category, thumbnailUrl, gameUrl, featured, tags, rating } = body;

    const existing = await db.game.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Game not found' }, { status: 404 });
    }

    const game = await db.game.update({
      where: { id },
      data: {
        ...(title && { title }),
        ...(description !== undefined && { description }),
        ...(category && { category }),
        ...(thumbnailUrl !== undefined && { thumbnailUrl }),
        ...(gameUrl && { gameUrl }),
        ...(featured !== undefined && { featured }),
        ...(tags !== undefined && { tags }),
        ...(rating !== undefined && { rating }),
      },
    });

    return NextResponse.json(game);
  } catch (error) {
    console.error('Error updating game:', error);
    return NextResponse.json({ error: 'Failed to update game' }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const existing = await db.game.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Game not found' }, { status: 404 });
    }

    await db.game.delete({ where: { id } });
    return NextResponse.json({ message: 'Game deleted successfully' });
  } catch (error) {
    console.error('Error deleting game:', error);
    return NextResponse.json({ error: 'Failed to delete game' }, { status: 500 });
  }
}
