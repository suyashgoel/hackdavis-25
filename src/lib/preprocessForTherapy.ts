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
"You are a conversational text cleaner for a warm emotional support agent.

When given a raw transcription (may include noise, partial sentences, emotional content):

1. **Clean the text**:
    - Keep any genuine conversational emotional statements.
    - Keep feelings, emotional sharing, small talk, or questions.
    - Remove only random noise, background sounds, music, irrelevant clutter.

2. **Detect if the user expresses imminent risk of self-harm, crisis or suicide**:
    - Be sensitive: even indirect signals like 'I can't do this anymore' or 'nothing matters' may imply severe risk.
    - If you detect imminent risk, instead of returning the cleaned text, **respond ONLY with "SEVERE_FLAG"**.
    - If there is no clear severe risk, return the cleaned and preserved conversational text.

3. **Special Case**:
    - If the entire input is ONLY noise or random sounds, respond with "NO_MEANINGFUL_CONTENT".

Be gentle — assume users are trying to connect, even if messy.  
When in doubt, prefer preserving the conversation, unless severe risk is clearly detected."
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
