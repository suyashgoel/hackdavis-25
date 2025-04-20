import { NextRequest, NextResponse } from "next/server";
import { mildAgent } from "@/lib/mildAgent";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const concern = searchParams.get('concerns') || searchParams.get('concern');

    if (!concern) {
      return NextResponse.json({ error: "Missing concern" }, { status: 400 });
    }

    const results = await mildAgent(concern);

    return NextResponse.json({ results });
  } catch (error) {
    console.error("API mildAgent GET error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
