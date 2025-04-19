// src/app/api/cartesia/route.ts
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import process from "node:process";
import { transcribeAudio } from "@/lib/transcribeAudio";
import OpenAI from "openai";
import { synthesizeAudio } from "@/lib/synthesizeAudio";

export async function POST(request: Request) {
  try {
    const CartesiaKey = process.env.CARTESIA_API_KEY;
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    if (!CartesiaKey) {
      return NextResponse.json(
        { error: "CARTESIA_API_KEY not set" },
        { status: 500 }
      );
    }

    const formData = await request.formData();
    const audioFile = formData.get("file");

    if (!audioFile || !(audioFile instanceof Blob)) {
      return NextResponse.json(
        { error: "No audio file provided" },
        { status: 400 }
      );
    }

    const file = new File([audioFile], "audio.webm", {
      type: audioFile.type || "audio/webm",
    });
    const userInput = await transcribeAudio(file);
    console.log("Transcribed User Input:", userInput);

    // now send this userInput to gpt 4 mayhbe, and get respone in chunks and send to cartesia

    const stream = new ReadableStream({
      async start(controller) {
        const completionStream = await openai.chat.completions.create({
          model: "gpt-4",
          messages: [{ role: "user", content: userInput }],
          stream: true,
        });

        let buffer = "";

        for await (const chunk of completionStream) {
          const content = chunk.choices[0]?.delta?.content;
          if (content) {
            buffer += content;

            if (content.endsWith(".") || content.endsWith("\n")) {
              console.log("Sending buffered chunk to Cartesia:", buffer);

              const cartesiaAudio = await synthesizeAudio(buffer);
              controller.enqueue(new Uint8Array(cartesiaAudio));
              buffer = "";
            }
          }
        }

        controller.close();
      },
    });

    return new Response(stream, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Transfer-Encoding": "chunked",
      },
    });
  } catch (error) {
    console.error("Error generating audio:", error);
    return NextResponse.json(
      { error: "Failed to generate audio" },
      { status: 500 }
    );
  }
}
