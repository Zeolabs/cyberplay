import { db } from '@/lib/db';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const sources = await db.gameSource.findMany({
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { games: true } } },
    });

    const formatted = sources.map(s => ({
      id: s.id,
      name: s.name,
      type: s.type,
      baseUrl: s.baseUrl,
      isActive: s.isActive,
      gamesFetched: s.gamesFetched,
      lastFetched: s.lastFetched,
      searchQuery: s.searchQuery,
      totalGames: s._count.games,
      createdAt: s.createdAt,
    }));

    return NextResponse.json(formatted);
  } catch (error) {
    console.error('Error fetching sources:', error);
    return NextResponse.json({ error: 'Failed to fetch sources' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, type, baseUrl, searchQuery } = body;

    if (!name || !type || !baseUrl) {
      return NextResponse.json(
        { error: 'Name, type, and baseUrl are required' },
        { status: 400 }
      );
    }

    const validTypes = ['CRAZYGAMES', 'POKI', 'CUSTOM'];
    if (!validTypes.includes(type)) {
      return NextResponse.json(
        { error: `Invalid type. Must be one of: ${validTypes.join(', ')}` },
        { status: 400 }
      );
    }

    const source = await db.gameSource.create({
      data: {
        name,
        type,
        baseUrl,
        searchQuery: searchQuery || '',
      },
    });

    return NextResponse.json(source, { status: 201 });
  } catch (error) {
    console.error('Error creating source:', error);
    return NextResponse.json({ error: 'Failed to create source' }, { status: 500 });
  }
}
