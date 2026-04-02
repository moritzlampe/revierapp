import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const { code } = await request.json()

  const gueltigerCode = process.env.INVITE_CODE || 'Felsenkeller2026'

  if (!code || code.toLowerCase() !== gueltigerCode.toLowerCase()) {
    return NextResponse.json({ error: 'Ungültiger Einladungscode' }, { status: 403 })
  }

  return NextResponse.json({ ok: true })
}
