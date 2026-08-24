import { NextResponse } from 'next/server';
export async function POST() { return NextResponse.json({status:'EMERGENCY_STOP_REQUESTED'}); }
