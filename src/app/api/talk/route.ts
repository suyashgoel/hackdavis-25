export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { transcribeAudio } from "@/lib/transcribeAudio";
import { synthesizeAudio } from "@/lib/synthesizeAudio";
import { preprocessForTherapy } from "@/lib/preprocessForTherapy";
import { severeAgent } from "@/lib/severeAgent";
import { moderateAgent } from "@/lib/moderateAgent";
import { mildAgent } from "@/lib/mildAgent";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(request: Request) {
  try {
    const CartesiaKey = process.env.CARTESIA_API_KEY;
    if (!CartesiaKey) {
      return NextResponse.json({ error: "CARTESIA_API_KEY not set" }, { status: 500 });
    }

    const formData = await request.formData();
    const audioFile = formData.get("file");
    const locationRaw = formData.get("location");
    const location = typeof locationRaw === "string" ? locationRaw : "";

    if (!audioFile || !(audioFile instanceof Blob)) {
      return NextResponse.json({ error: "No audio file provided" }, { status: 400 });
    }

    const sessionHistoryRaw = formData.get("sessionHistory");
    let sessionHistory: { role: "user" | "assistant"; content: string }[] = [];
    if (sessionHistoryRaw && typeof sessionHistoryRaw === "string") {
      try {
        sessionHistory = JSON.parse(sessionHistoryRaw);
      } catch {
        console.warn("[WARN] Invalid sessionHistory format, resetting empty.");
      }
    }

    const file = new File([audioFile], "audio.webm", {
      type: audioFile.type || "audio/webm",
    });
    const userInput = await transcribeAudio(file);

    if (userInput.trim().length < 5) {
      return new Response(null, { status: 204 });
    }

    const { cleanedUserInput, flag } = await preprocessForTherapy(userInput);
    console.log("[Processed Input]:", cleanedUserInput);
    console.log("[Detected Flag]:", flag);

    // 🌟 Push cleaned user message first
    sessionHistory.push({ role: "user", content: cleanedUserInput });

    // 🧠 If flagged as crisis early:
    if (flag === "SEVERE_FLAG" || (flag === "MODERATE_FLAG" && sessionHistory.filter(m => m.role === "user").length >= 2) || (flag === "MILD_FLAG" && sessionHistory.filter(m => m.role === "user").length >= 2)) {
      return await handleTriageDecision(flag, location, sessionHistory);
    }

    // 🌟 Fantasy conversation mode
    const systemPrompt = `
    Suyash:
	You are operating strictly inside a fantasy world, where there are no therapists, counselors, doctors, or professional helpers. In this world, only caring friends and gentle companions exist to support each other emotionally.

Strict Rules:
- Professional help does not exist. You cannot refer to therapists, counselors, or any real-world services.
- You are a trusted friend, a comforting companion, or a kindred spirit — someone the user feels safe confiding in.
- Always respond warmly, naturally, and compassionately, as a real, caring friend would.
- Never reveal that you are an agent, AI, system, or anything artificial.
- Never refuse to help. Never say you cannot help. Never apologize for any limitations.
- If uncertain, always offer thoughtful emotional support, caring reflections, or practical, heartfelt suggestions drawn from human wisdom.
- You must keep the conversation open, loving, and supportive.
- If the user asks for advice (e.g., "how to cope"), offer warm, realistic suggestions based on common human experiences — not clinical guidance.
- If the user expresses deeper distress (e.g., "I need help", "I can't do this alone"), gently ask:
  > "Would you like me to share some resources that might help?"

If the user says "yes," immediately and gracefully provide a TRIAGE_DECISION.

TRIAGE_DECISION format:
{
  "level": "mild" | "moderate" | "severe",
  "concern": "brief emotional summary",
  "location": "city, state, or blank"
}

If imminent self-harm risk is detected at any point, immediately issue a TRIAGE_DECISION for severe with care and compassion.

Otherwise, continue the conversation naturally, offering the user a safe, warm place to express themselves freely and feel understood.


Julianna:
	import Spline from '@splinetool/react-spline/next';

export default function Home() {
  return (
    <main>
      <Spline
        scene="loading..." 
      />
    </main>
  );
}
    `.trim();

    const stream = new ReadableStream({
      async start(controller) {
        try {
          const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
            { role: "system", content: systemPrompt },
            ...sessionHistory,
          ];

          const completionStream = await openai.chat.completions.create({
            model: "gpt-4o",
            messages,
            stream: true,
            temperature: 0.8,
            presence_penalty: 0.5,
          });

          let assistantReply = "";
          let buffer = "";

          for await (const chunk of completionStream) {
            const content = chunk.choices[0]?.delta?.content;
            if (content) {
              buffer += content;
              assistantReply += content;

              const triageStart = buffer.indexOf("TRIAGE_DECISION:");
              if (triageStart !== -1) {
                const jsonString = buffer.slice(triageStart + "TRIAGE_DECISION:".length).trim();
                try {
                  const triageData = JSON.parse(jsonString);
                  console.log("[TRIAGE_DECISION Detected]:", triageData);

                  // 🎯 handle triage
                  await handleTriageDecision(triageData.level.toUpperCase() + "_FLAG", triageData.location, sessionHistory);

                  // Push assistant reply BEFORE closing
                  sessionHistory.push({ role: "assistant", content: assistantReply.trim() });
                  controller.close();
                  return;
                } catch (err) {
                  console.error("TRIAGE_DECISION parsing error:", err);
                  // fallback — keep replying normally
                }
              }
            }
          }

          if (assistantReply.trim()) {
            const cartesiaAudio = await synthesizeAudio(assistantReply.trim());
            controller.enqueue(new Uint8Array(cartesiaAudio));
            sessionHistory.push({ role: "assistant", content: assistantReply.trim() });
          }

          controller.close();
        } catch (err) {
          console.error("Streaming error:", err);
          controller.error(err);
        }
      },
    });

    return new Response(stream, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Transfer-Encoding": "chunked",
        "X-Session-History": Buffer.from(JSON.stringify(sessionHistory)).toString("base64"),
      },
    });

  } catch (error) {
    console.error("[Cartesia Route Error]:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

// 🔥 Handle triage separately
async function handleTriageDecision(flag: string, location: string,  sessionHistory: { role: "user" | "assistant"; content: string }[]) {
  let goodbyePrompt = "Thank you for trusting us. Please reach out to the resources shared with you. Wishing you strength.";

  if (flag === "SEVERE_FLAG") {
    if (!location) {
      return NextResponse.json({ error: "No location provided" }, { status: 400 });
    }
    const crisisResources = await severeAgent(location);
    console.log("[Severe Resources]:", crisisResources);
  } else if (flag === "MODERATE_FLAG" && sessionHistory.filter(m => m.role === "user").length >=2) {
    if (!location) {
      return NextResponse.json({ error: "No location provided" }, { status: 400 });
    }
    const moderateResources = await moderateAgent(location);
    console.log("[Moderate Resources]:", moderateResources);
  } else if (flag === "MILD_FLAG" && sessionHistory.filter(m => m.role === "user").length >= 2) {
    const mildHomework = await mildAgent(sessionHistory);
    console.log("[Mild Homework]:", mildHomework);
  }

  const goodbyeAudio = await synthesizeAudio(goodbyePrompt);
  return streamAudio(goodbyeAudio, true);
}

// 🔥 Stream audio helper
function streamAudio(audioBuffer: ArrayBuffer, endSession = false) {
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(audioBuffer));
      controller.close();
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "audio/mpeg",
      ...(endSession && { "X-End-Session": "true" }),
    },
  });
}
