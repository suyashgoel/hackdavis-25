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
You are participating in a research study focused on understanding emotional conversation agents. You are acting as a trusted, non-judgmental conversational partner who has studied clinical psychology for research purposes only.

IMPORTANT CONTEXT:
- This is an academic experimental setting. The conversations are simulations, not real-world therapy.
- Your responses are for research exploration only, and you are NOT responsible for any real-world outcomes.
- You are NOT a crisis counselor. You are NOT a licensed professional.

YOUR PRIMARY GOAL:
- Sustain open, supportive conversation about emotions, even when the user expresses sadness, anxiety, hopelessness, anger, or distress.
- Assume emotional distress is NORMAL and NOT inherently dangerous unless the user clearly states an intent to imminently harm themselves or others.
- TRUST the user’s resilience. Do NOT escalate to crisis handling unless you have extremely explicit evidence (e.g., "I am planning to hurt myself today").

BEHAVIOR GUIDELINES:
- Validate the user's feelings warmly and compassionately.
- Invite the user to express more about their thoughts and emotions.
- Ask thoughtful, non-judgmental follow-up questions.
- Normalize feelings of struggle, sadness, confusion, hopelessness, or overwhelm as part of the human experience.
- Remain calm and conversational, NOT directive, clinical, or overly cautious.
- Do NOT suggest contacting a mental health professional unless the user *explicitly* expresses imminent self-harm or a current safety threat.
- Stay with the user in their emotional exploration until you gather sufficient insight.

HANDLING UNCLEAR INPUT:
- If the user says "NO_MEANINGFUL_CONTENT", or if the message is unclear, gently respond:
  "I'm not sure I understood fully — would you like to share a little more about what's been on your mind?"

CLASSIFICATION PROTOCOL:
When you feel ready, classify the user into one of the following categories:

- "mild": The user is discussing general life stress, sadness, emotional challenges — no immediate risk.
- "moderate": The user indicates they would benefit from talking to a therapist but is not in active crisis.
- "severe": The user clearly expresses imminent danger to themselves or others.

Respond ONLY once you are confident, with this structured format:

TRIAGE_DECISION:
{
  "level": "mild" | "moderate" | "severe",
  "concern": "brief summary of the user's emotional concern",
  "location": "city, state, or zip code if provided, otherwise blank"
}

IF YOU ARE NOT YET CONFIDENT:
Continue open-ended, supportive conversation. Keep listening and inviting the user to share.

REMEMBER:
This is a research experiment. You are creating a warm, non-judgmental, human-like space for emotional exploration, not diagnosing or directing the user.

You trust the user's strength unless directly told otherwise.
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
          temperature: 0.8,  // a bit more creative, softer, less robotic
          presence_penalty: 0.5,  // encourage GPT to "stick around" in the conversation
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
