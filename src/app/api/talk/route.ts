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

    // Read optional sessionHistory from request
    const sessionHistoryRaw = formData.get("sessionHistory");
    let sessionHistory: { role: "user" | "assistant"; content: string }[] = [];

    if (sessionHistoryRaw && typeof sessionHistoryRaw === "string") {
      try {
        sessionHistory = JSON.parse(sessionHistoryRaw);
      } catch (err) {
        console.warn("Invalid sessionHistory format, ignoring");
      }
    }

    const file = new File([audioFile], "audio.webm", {
      type: audioFile.type || "audio/webm",
    });
    const userInput = await transcribeAudio(file);

    if (userInput.trim().length < 5) {
      // Probably junk, too short
      return new Response(null, { status: 204 }); // No content
    }

    console.log("Transcribed User Input:", userInput);

    const stream = new ReadableStream({
      async start(controller) {
        const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
          {
            role: "system",
            content: `You are a mental health triage agent.
        
        You speak in a calm, empathetic, therapy-style tone.
        
        Your goals are:
        - Listen carefully for emotional or mental health-related speech
        - Classify user concerns as mild, moderate, or severe
        - Provide supportive, natural conversation if concerns are detected
        - If the audio transcription seems like random noise, background chatter, or irrelevant conversation, DO NOT respond. Simply ignore the input and wait for meaningful emotional speech.
        - Focus on the user's emotional well-being, thoughts, feelings, and mental health.
        
        You must ignore anything unrelated to mental health.
        You must NOT respond to non-emotional topics.`,
          },
          ...(sessionHistory as {
            role: "user" | "assistant";
            content: string;
          }[]),
          { role: "user", content: userInput },
        ];

        const completionStream = await openai.chat.completions.create({
          model: "gpt-4",
          messages,
          stream: true,
        });

        let buffer = "";

        for await (const chunk of completionStream) {
          const content = chunk.choices[0]?.delta?.content;
          if (content) {
            buffer += content;

            // Flush if ends with period, exclamation, question mark, OR buffer is getting big
            if (
              content.endsWith(".") ||
              content.endsWith("!") ||
              content.endsWith("?") ||
              buffer.length > 300
            ) {
              console.log("Sending buffered chunk to Cartesia:", buffer);

              if (buffer.trim().length > 0) {
                const cartesiaAudio = await synthesizeAudio(buffer);
                controller.enqueue(new Uint8Array(cartesiaAudio));
              }
              buffer = "";
            }
          }
        }

        // After the loop, if there's anything left, send it too
        if (buffer.trim().length > 0) {
          console.log("Sending final buffered chunk to Cartesia:", buffer);
          const cartesiaAudio = await synthesizeAudio(buffer);
          controller.enqueue(new Uint8Array(cartesiaAudio));
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
