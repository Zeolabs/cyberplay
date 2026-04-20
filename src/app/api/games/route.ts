import { db } from '@/lib/db';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category');
    const genre = searchParams.get('genre');
    const search = searchParams.get('search');
    const featured = searchParams.get('featured');
    const sortBy = searchParams.get('sortBy') || 'newest';

    const where: Record<string, unknown> = {};

    if (category && category !== 'ALL') {
      where.category = category;
    }

    if (genre && genre !== 'All' && genre !== 'all') {
      where.genre = { contains: genre };
    }

    if (search) {
      where.OR = [
        { title: { contains: search } },
        { description: { contains: search } },
        { tags: { contains: search } },
        { genre: { contains: search } },
      ];
    }

    if (featured === 'true') {
      where.featured = true;
    }

    let orderBy: Record<string, string> = { createdAt: 'desc' };

    if (sortBy === 'popular') orderBy = { plays: 'desc' };
    else if (sortBy === 'top-rated') orderBy = { rating: 'desc' };
    else if (sortBy === 'newest') orderBy = { createdAt: 'desc' };
    else if (sortBy === 'oldest') orderBy = { createdAt: 'asc' };

    const games = await db.game.findMany({
      where,
      orderBy,
    });

    return NextResponse.json(games);
  } catch (error) {
    console.error('Error fetching games:', error);
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: 'Failed to fetch games', detail: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { title, description, category, genre, thumbnailUrl, gameUrl, featured, tags } = body;

    if (!title || !description || !category || !gameUrl) {
      return NextResponse.json(
        { error: 'Title, description, category, and gameUrl are required' },
        { status: 400 }
      );
    }

    const validCategories = ['HTML5', 'UNITY_WEBGL', 'FLASH'];
    if (!validCategories.includes(category)) {
      return NextResponse.json(
        { error: 'Invalid category. Must be HTML5, UNITY_WEBGL, or FLASH' },
        { status: 400 }
      );
    }

    const game = await db.game.create({
      data: {
        title,
        description,
        category,
        genre: genre || '',
        thumbnailUrl: thumbnailUrl || '',
        gameUrl,
        featured: featured || false,
        tags: tags || '',
      },
    });

    return NextResponse.json(game, { status: 201 });
  } catch (error) {
    console.error('Error creating game:', error);
    return NextResponse.json({ error: 'Failed to create game' }, { status: 500 });
  }
}
