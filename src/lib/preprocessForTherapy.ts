import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function preprocessForTherapy(
  rawTranscript: string
): Promise<{
  cleanedUserInput: string;
  flag: "SEVERE_FLAG" | "MODERATE_FLAG" | "MILD_FLAG" | "INDETERMINATE";
}> {
  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content: `
You are an emotional conversation softener and triage detector for a supportive research agent.

YOUR TASK:

Step 1 — CLEAN THE INPUT:
- Remove background noise, irrelevant words, filler sounds.
- Keep only meaningful emotional sharing, small talk, or emotional questions.
- Soften strong emotional language (e.g., "depressed", "hopeless") into a warm, human expression.
- Keep it first person ("I", "me", "my").

Step 2 — DETECT TRIAGE LEVEL:
- If imminent self-harm risk is detected (suicidal ideation, severe crisis), set flag to "SEVERE_FLAG".
- If clear signs of major emotional struggle (persistent sadness, hopelessness, fatigue, disconnection) exist but not crisis level, set flag to "MODERATE_FLAG".
- If mild sadness, mild stress, or mild emotional struggle, set flag to "MILD_FLAG".
- If no meaningful emotional sharing detected, set flag to "INDETERMINATE".

OUTPUT RESPONSE STRICTLY AS JSON, NO EXTRAS:

{
  "cleanedUserInput": "the softened cleaned text here",
  "flag": "SEVERE_FLAG" | "MODERATE_FLAG" | "MILD_FLAG" | "INDETERMINATE"
}

RULES:
- Do NOT comment back.
- Do NOT apologize or explain.
- Only output valid JSON following the format exactly.
- If uncertain, always default to "INDETERMINATE".
`.trim(),
      },
      {
        role: "user",
        content: rawTranscript,
      },
    ],
    temperature: 0.4,
  });

  const responseText = completion.choices[0]?.message?.content?.trim();

  if (!responseText) {
    throw new Error("No content returned from OpenAI triage call.");
  }

  try {
    const parsed = JSON.parse(responseText);
    return parsed;
  } catch (error) {
    console.error("Failed to parse triage JSON:", responseText);
    throw new Error("Triage response was not valid JSON.");
  }
}
