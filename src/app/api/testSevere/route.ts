import { NextRequest, NextResponse } from "next/server";
import { severeAgent } from "@/lib/severeAgent";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const location = searchParams.get("location");

    if (!location) {
      return NextResponse.json({ error: "Missing location" }, { status: 400 });
    }

    const results = await severeAgent(location);

    return NextResponse.json({ results });
  } catch (error) {
    console.error("API severeAgent GET error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
