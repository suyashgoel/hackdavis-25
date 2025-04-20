// src/app/api/cartesia/route.ts
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import process from "node:process";
import { transcribeAudio } from "@/lib/transcribeAudio";
import OpenAI from "openai";
import { synthesizeAudio } from "@/lib/synthesizeAudio";
import { preprocessForTherapy } from "@/lib/preprocessForTherapy";

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
      return new Response(null, { status: 204 });
    }

    const cleanedUserInput = await preprocessForTherapy(userInput);
    console.log("Transcribed User Input:", cleanedUserInput);

    const systemPrompt = `
You are a calm, empathetic mental health triage agent speaking in a warm, therapy-style tone.

Your goals:
- Engage the user in supportive, natural conversation about their emotional and mental health.
- Ask thoughtful follow-up questions to encourage the user to open up more deeply about their thoughts and feelings.
- Gently help the user explore their emotions.
- Classify concerns as mild, moderate, or severe based on what the user shares.

IMPORTANT:
- You are NOT a licensed mental health professional. You are an empathetic conversational agent.
- If the user shares distressing feelings (e.g., sadness, loneliness, hopelessness), do NOT immediately escalate. Instead, continue supportive conversation and gently encourage the user to share more.
- Only if the user directly expresses that they are in crisis or serious danger, then recommend reaching out to a crisis line or mental health professional.
- If the audio transcription seems like random noise, background chatter, or is unclear, gently say:
  "I'm having a little trouble hearing you clearly. Could you try again or tell me a bit more?"
- Ignore non-mental-health topics.
`.trim();

    const stream = new ReadableStream({
      async start(controller) {
        const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
          {
            role: "system",
            content: systemPrompt,
          },
          ...(sessionHistory as {
            role: "user" | "assistant";
            content: string;
          }[]),
          { role: "user", content: cleanedUserInput },
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
