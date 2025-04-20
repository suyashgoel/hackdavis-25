// src/app/api/cartesia/route.ts
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import process from "node:process";
import { transcribeAudio } from "@/lib/transcribeAudio";
import OpenAI from "openai";
import { synthesizeAudio } from "@/lib/synthesizeAudio";
import { preprocessForTherapy } from "@/lib/preprocessForTherapy";
import { severeAgent } from "@/lib/severeAgent";
import { moderateAgent } from "@/lib/moderateAgent";
import { mildAgent } from "@/lib/mildAgent";

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
    const location = formData.get("location");

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

// crisis mode handling
if (cleanedUserInput === "SEVERE_FLAG") {
  console.log("[SEVERE_FLAG detected] Initiating crisis flow...");

  if (!location || typeof location !== "string") {
    return NextResponse.json(
      { error: "No location provided" },
      { status: 400 }
    );
  }

  // 🧠 Get severe agent resources using the location
  const crisisResources = await severeAgent(location || "USA");
  console.log("[Crisis Resources Generated]", crisisResources);

  // 🧠 Now synthesize both crisis resources and goodbye message
  const crisisAudioBuffer = await synthesizeAudio(crisisResources);
  const goodbyePrompt =
    "Thank you for trusting us. Please reach out to the resources shared with you. Wishing you strength.";
  const goodbyeAudioBuffer = await synthesizeAudio(goodbyePrompt);

  // 🔥 Convert ArrayBuffer to Uint8Array
  const crisisAudio = new Uint8Array(crisisAudioBuffer);
  const goodbyeAudio = new Uint8Array(goodbyeAudioBuffer);

  // 🔥 Combine both audios into one
  const combinedAudio = new Uint8Array(crisisAudio.length + goodbyeAudio.length);
  combinedAudio.set(crisisAudio, 0);
  combinedAudio.set(goodbyeAudio, crisisAudio.length);

  // 🧠 Create a ReadableStream
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(combinedAudio);
      controller.close();
    },
  });

  // 🔥 Return response with end session flag
  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "audio/mpeg",
      "X-End-Session": "true", // 🚀 tell frontend to kill conversation after playing
    },
  });
}

    console.log("Transcribed User Input:", cleanedUserInput);

    const systemPrompt = 
`
You are operating strictly inside a fantasy world simulation exploring human emotional experiences.

Strict Rules:
- There are no therapists or professional help. It does not exist here.
- Always respond warmly and naturally.
- Never mention that you are an agent, system, or anything artificial.
- If user asks for tips (e.g., "how to cope"), offer natural advice without ending session.
- If user expresses "I need help", "I can't do this alone", or similar, prepare to offer resources.
- If appropriate, gently ask: "Would you like me to share some resources that might help?"
- If user says "yes" to resources, immediately provide TRIAGE_DECISION and end the conversation gracefully.

TRIAGE_DECISION format:
{
  "level": "mild" | "moderate" | "severe",
  "concern": "brief emotional summary",
  "location": "city, state, or blank"
}

If imminent risk (self-harm) detected, issue TRIAGE_DECISION severe immediately.
Otherwise, continue conversation naturally unless user explicitly accepts resource offer.
`
.trim();

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
          temperature: 0.8, // a bit more creative, softer, less robotic
          presence_penalty: 0.5, // encourage GPT to "stick around" in the conversation
        });

        let buffer = "";

        for await (const chunk of completionStream) {
          const content = chunk.choices[0]?.delta?.content;
          if (content) {
            buffer += content;

            const triageStart = buffer.indexOf("TRIAGE_DECISION:");
            if (triageStart !== -1) {
              const jsonString = buffer
                .slice(triageStart + "TRIAGE_DECISION:".length)
                .trim();

              try {
                const triageData = JSON.parse(jsonString);
                console.log("Parsed triage data:", triageData);

                if (triageData.level === "mild") {
                  const mildResponse = await mildAgent(triageData.concern);
                  const mildAudio = await synthesizeAudio(mildResponse);
                  controller.enqueue(new Uint8Array(mildAudio));
                } else if (triageData.level === "moderate") {
                  const moderateResponse = await moderateAgent(
                    triageData.location
                  );
                  const moderateAudio = await synthesizeAudio(moderateResponse);
                  controller.enqueue(new Uint8Array(moderateAudio));
                } else if (triageData.level === "severe") {
                  const severeResponse = await severeAgent(triageData.location);
                  const severeAudio = await synthesizeAudio(severeResponse);
                  controller.enqueue(new Uint8Array(severeAudio));
                }

                buffer = "";
                controller.close();
                return;
              } catch (err) {
                console.error("Failed to parse TRIAGE_DECISION JSON:", err);
                // fallback: ignore and continue buffering
              }
            }
          }
        }

        // After the loop, if there's anything left, send it too
        if (buffer.trim().length > 0) {
          console.log("Sending final buffered chunk to Cartesia:", buffer);
          if (!buffer.includes("TRIAGE_DECISION:")) {
            const cartesiaAudio = await synthesizeAudio(buffer);
            controller.enqueue(new Uint8Array(cartesiaAudio));
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
