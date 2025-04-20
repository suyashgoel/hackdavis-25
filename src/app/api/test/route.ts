import { NextRequest, NextResponse } from "next/server";
import { moderateAgent } from "@/lib/moderateAgent";

export async function POST(req: NextRequest) {
  try {
    const { locationInfo } = await req.json();

    if (!locationInfo) {
      return NextResponse.json({ error: "Missing locationInfo" }, { status: 400 });
    }

    const results = await moderateAgent(locationInfo);

    return NextResponse.json({ results });
  } catch (error) {
    console.error("API moderateAgent POST error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const locationInfo = searchParams.get("locationInfo");

    if (!locationInfo) {
      return NextResponse.json({ error: "Missing locationInfo" }, { status: 400 });
    }

    const results = await moderateAgent(locationInfo);

    return NextResponse.json({ results });
  } catch (error) {
    console.error("API moderateAgent GET error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
