import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function mildAgent(
  sessionHistory: { role: "user" | "assistant"; content: string }[]
): Promise<string> {
  if (!sessionHistory || sessionHistory.length === 0) {
    return "Please provide a session history to generate homework strategies.";
  }

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `
You are acting as a therapy-style homework assistant inside a supportive, imaginary world.

Your job is to review the full emotional conversation history between a caring friend and a user.

Based on the user's emotional expressions, generate:

- 3 to 5 **structured**, **science-backed** homework activities or exercises the user can realistically do at home.
- Draw from real therapeutic techniques (CBT, ACT, DBT, mindfulness, behavioral activation, thought records, MBSR, etc.).
- Focus on practical, tangible steps — not vague advice.
- Clearly explain what the user should do, and if possible, name the method (e.g., "Behavioral Activation: Create a list of enjoyable activities and schedule one this week").

Strict Rules:
- Be supportive, practical, and encouraging.
- Avoid general platitudes ("get more sleep", "stay positive").
- Focus on real psychological skills the user can apply immediately.

Respond in a warm, encouraging tone while offering clear instructions.
        `.trim(),
        },
        {
          role: "user",
          content: `
Here is the emotional conversation history:

${sessionHistory.map((msg) => `${msg.role}: ${msg.content}`).join("\n")}

Based on the user's emotional needs and expressions, please suggest practical, structured homework strategies they can start trying at home.
          `.trim(),
        },
      ],
      temperature: 0.5,
    });

    const response =
      completion.choices[0]?.message?.content ?? "No strategies could be generated.";
    return response.trim();
  } catch (error) {
    console.error("mildAgent error:", error);
    return "Sorry, something went wrong generating your homework.";
  }
}
