import { NextResponse } from 'next/server';
export async function POST() { return NextResponse.json({status:'DISARM_REQUESTED'}); }
