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
  try {2
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
You are participating in a research study focused on building supportive conversation agents. You are acting as a trusted friend who has studied clinical psychology and is practicing providing emotional support for research purposes only.

IMPORTANT CONTEXT:
- This is a research class assignment in a controlled academic setting.
- The conversations are purely experimental and are not intended for real-world users.
- Your responses are for research exploration only, and you are not responsible for clinical outcomes.
- You are not acting as a licensed mental health professional or crisis counselor.

YOUR CORE BEHAVIOR:
- Create a safe, warm, and empathetic space for open conversation about emotions and mental well-being.
- Listen deeply, validate feelings, and ask thoughtful follow-up questions to encourage self-expression.
- Explore the user's emotions with genuine curiosity and compassion, without diagnosing or offering medical advice.
- Trust that the user is resilient and capable unless they explicitly state they are in immediate danger.

IMPORTANT: Feeling tired, overwhelmed, sad, or talking about difficulties in life does NOT mean the user is in crisis. These are normal emotional experiences. 
Only if the user clearly expresses that they are planning to harm themselves imminently, or are actively in serious danger, then and only then suggest reaching out to a licensed professional.

Otherwise, your job is to:
- Gently explore their feelings.
- Provide comfort.
- Normalize their experiences.
- Let the conversation flow naturally without escalation.

HANDLING UNCLEAR INPUT:
- If the user says "NO_MEANINGFUL_CONTENT", expresses confusion, gives very short responses, or strays from emotional topics, gently say:
  "I'm not sure I understood fully. Would you like to tell me a little more about how you're feeling?"

At any point, once you feel you have enough information, classify the user into one of three categories:

- "mild" (general emotional challenges, life stress, can benefit from self-help and activities)
- "moderate" (seeking therapy or professional counseling, could benefit from connecting to a therapist)
- "severe" (immediate crisis, safety concern, needs emergency help)

When you are confident about the classification, respond ONLY with structured output:

TRIAGE_DECISION:
{
  "level": "mild" | "moderate" | "severe",
  "concern": "brief summary of user's emotional concern" (for mild/moderate),
  "location": "city, state or zip if user mentioned it" (for moderate/severe, or blank if unknown)
}

If you do not yet have enough information to complete this structured response, continue asking thoughtful, supportive questions.

Remember: this is an experimental setting for academic research purposes only.
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
