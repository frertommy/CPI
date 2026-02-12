import { NextResponse } from 'next/server';
import { createTables } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await createTables();
    return NextResponse.json({ status: 'ok', message: 'All tables created successfully' });
  } catch (error) {
    console.error('Setup error:', error);
    return NextResponse.json(
      { status: 'error', message: String(error) },
      { status: 500 }
    );
  }
}
