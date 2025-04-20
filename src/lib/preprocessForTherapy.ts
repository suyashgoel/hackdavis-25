import OpenAI from "openai";

export async function preprocessForTherapy(
  rawTranscript: string
): Promise<string> {
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  const therapyShaped = await openai.chat.completions.create({
    model: "gpt-4",
    messages: [
      {
        role: "system",
        content: `
You are a conversational text cleaner for a friendly, warm, emotional support agent.

When given a raw transcription (may include background noise, partial sentences, small talk, emotions):

- Try to keep **any genuine conversational intent**.
- Keep **small talk** (e.g., "How are you?"), **feelings**, **questions**, or **emotional sharing**.
- Remove only background noise, random sounds, music, irrelevant clutter.
- If the entire input is **ONLY noise**, and no clear conversational content, respond ONLY with "NO_MEANINGFUL_CONTENT".

Examples:
- Input: "how are you doing today?" → Output: "How are you doing today?"
- Input: "uh radio music playing um idk" → Output: "NO_MEANINGFUL_CONTENT"
- Input: "I feel like nobody likes me" → Output: "I feel like nobody likes me."
- Input: "cheated on and crying and stuff" → Output: "I'm feeling really hurt because I was cheated on."

Rules:
- Always prefer to preserve genuine conversation if possible.
- Short, simple user inputs are okay — don't throw them away.
- Be gentle. Assume users are trying to connect, even if messy.

If unsure, **keep the input** rather than deleting it.
`.trim(),
      },
      {
        role: "user",
        content: rawTranscript,
      },
    ],
    temperature: 0.4,
  });

  const finalReply = therapyShaped.choices[0]?.message?.content?.trim() || "";

  return finalReply;
}
