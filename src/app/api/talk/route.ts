// src/app/api/cartesia/route.ts

import { NextResponse } from "next/server";
import { CartesiaClient } from "@cartesia/cartesia-js";
import process from "node:process";
import { writeFileSync } from "node:fs";

export async function GET() {
  try {
    const apiKey = process.env.CARTESIA_API_KEY;

    if (!apiKey) {
      return NextResponse.json({ error: "CARTESIA_API_KEY not set" }, { status: 500 });
    }

    const client = new CartesiaClient({ apiKey });

    const response = await client.tts.bytes({
      modelId: "sonic-2",
      transcript: "Hello, world!",
      voice: {
        mode: "id",
        id: "694f9389-aac1-45b6-b726-9d9369183238",
      },
      language: "en",
      outputFormat: {
        container: "wav",
        sampleRate: 44100,
        encoding: "pcm_f32le",
      },
    });

    writeFileSync("sonic.wav", new Uint8Array(response));

    return new Response(response, {
      status: 200,
      headers: {
        "Content-Type": "audio/wav",
        "Content-Disposition": 'attachment; filename="sonic.wav"',
      },
    });
  } catch (error) {
    console.error("Error generating audio:", error);
    return NextResponse.json({ error: "Failed to generate audio" }, { status: 500 });
  }
}
