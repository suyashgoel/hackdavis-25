import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function mildAgent(concern: string): Promise<string> {
  if (!concern) return "Please provide a concern to receive homework strategies.";

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `
You are acting as a therapy homework assistant.

When given a user's emotional or mental health concern, your job is to generate:

- 3 to 5 structured, science-backed homework assignments, exercises, or protocols they can realistically implement on their own.
- Pull from real therapies and science, such as CBT exercises (thought records, behavioral activation), ACT (acceptance and commitment therapy), DBT (distress tolerance, emotional regulation), mindfulness training, or known protocols (Huberman Lab Sleep Toolkit, MBSR, etc).
- Be specific: what exactly should they DO at home? Describe the activity, framework, or worksheet clearly.
- If available, mention the name of the technique or protocol they can research or use (but explain it simply).
- Avoid generic advice ("get more sleep", "think positive"). Provide real practices with purpose and structure.

The goal is to give users practical, tangible activities they can start doing immediately to improve their concern.

Respond supportively and practically.
`
        },
        {
          role: "user",
          content: `Concern: ${concern}`,
        },
      ],
      temperature: 0.5,
    });

    const response = completion.choices[0].message.content ?? "No strategies could be generated.";
    return response.trim();
  } catch (error) {
    console.error("mildAgent error:", error);
    return "Sorry, something went wrong generating your homework.";
  }
}
