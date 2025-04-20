import OpenAI from "openai";

export async function getTriageState(
  sessionHistory: { role: "user" | "assistant"; content: string }[]
): Promise<string> {
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  const triageResult = await openai.chat.completions.create({
    model: "gpt-4",
    messages: [
      {
        role: "system",
        content: `
You are a triage analyzer for a supportive conversation agent.

YOUR TASK:

Given a chat history (alternating user and assistant messages), determine the **overall emotional intensity level** of the user's mental state.

Return one of the following flags:

- **MILD_FLAG**: Minor stress, everyday struggles, small worries, light sadness, venting, seeking casual support.
- **MODERATE_FLAG**: Noticeable distress, moderate emotional pain, strong sadness, frustration, feelings of isolation, emotional overwhelm.
- **INDETERMINATE**: If not enough emotional information is available to clearly judge.

RULES:
- **Only output one flag: MILD_FLAG, MODERATE_FLAG, or INDETERMINATE.**
- **Do not explain your reasoning.**
- **Focus ONLY on the user's emotional expressions, not the assistant's replies.**

Analyze thoughtfully and return just the flag.

`.trim(),
      },
      {
        role: "user",
        content: JSON.stringify(sessionHistory),
      },
    ],
    temperature: 0,
  });

  const finalFlag = triageResult.choices[0]?.message?.content?.trim() || "INDETERMINATE";

  return finalFlag;
}
