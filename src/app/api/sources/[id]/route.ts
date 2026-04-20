import { db } from '@/lib/db';
import { NextResponse } from 'next/server';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const source = await db.gameSource.findUnique({
      where: { id },
      include: { _count: { select: { games: true } } },
    });

    if (!source) {
      return NextResponse.json({ error: 'Source not found' }, { status: 404 });
    }

    return NextResponse.json({
      ...source,
      totalGames: source._count.games,
    });
  } catch (error) {
    console.error('Error fetching source:', error);
    return NextResponse.json({ error: 'Failed to fetch source' }, { status: 500 });
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { name, searchQuery, isActive } = body;

    const existing = await db.gameSource.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Source not found' }, { status: 404 });
    }

    const source = await db.gameSource.update({
      where: { id },
      data: {
        ...(name && { name }),
        ...(searchQuery !== undefined && { searchQuery }),
        ...(isActive !== undefined && { isActive }),
      },
    });

    return NextResponse.json(source);
  } catch (error) {
    console.error('Error updating source:', error);
    return NextResponse.json({ error: 'Failed to update source' }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const existing = await db.gameSource.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Source not found' }, { status: 404 });
    }

    // Remove sourceId from linked games
    await db.game.updateMany({
      where: { sourceId: id },
      data: { sourceId: null },
    });

    await db.gameSource.delete({ where: { id } });
    return NextResponse.json({ message: 'Source deleted successfully' });
  } catch (error) {
    console.error('Error deleting source:', error);
    return NextResponse.json({ error: 'Failed to delete source' }, { status: 500 });
  }
}
