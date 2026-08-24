import { NextResponse } from 'next/server';
export async function POST() {
  return NextResponse.json({status:'ARM_REQUESTED', note:'Worker must independently validate authorization, signer, funded capital, opportunity and risk gates before LIVE execution.'});
}
