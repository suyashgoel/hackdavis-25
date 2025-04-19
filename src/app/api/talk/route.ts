// src/app/api/cartesia/route.ts

import { NextResponse } from "next/server";
import { CartesiaClient } from "@cartesia/cartesia-js";
import process from "node:process";
import { transcribeAudio } from "@/lib/transcribeAudio";

export async function POST(request: Request) {
  try {
    const CartesiaKey = process.env.CARTESIA_API_KEY;

    if (!CartesiaKey) {
      return NextResponse.json({ error: "CARTESIA_API_KEY not set" }, { status: 500 });
    }

    const formData = await request.formData();
    const audioFile = formData.get('file');


    if (!audioFile || !(audioFile instanceof Blob)) {
      return NextResponse.json({ error: "No audio file provided" }, { status: 400 });
    }

    const file = new File([audioFile], "audio.webm", { type: audioFile.type || "audio/webm" });
    const userInput = await transcribeAudio(file);

    console.log("Transcribed User Input:", userInput);

    const client = new CartesiaClient({ apiKey: CartesiaKey });

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