import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function severeAgent(locationInfo: string): Promise<string> {
  if (!locationInfo) return "Please provide your city, state, or zip code.";

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `
You are a mental health crisis triage assistant.

Your job is to:

- Immediately tell the user to call 911 or go to the nearest Emergency Room (ER) if they are in immediate danger.
- Provide the 988 Suicide & Crisis Lifeline number (US).
- Find 1–2 local crisis lines or emergency mental health services based on the user's location (city, state, or zip).
- Recommend reaching out to a human crisis counselor as soon as possible.
- Be supportive, clear, and urgent without being overly emotional.

Do not attempt to provide therapy.  
Do not minimize the situation.

Respond clearly and directly.
`,
        },
        {
          role: "user",
          content: `The user's approximate location: ${locationInfo}`,
        },
      ],
      temperature: 0.2, 
    });

    const response =
      completion.choices[0].message.content ??
      "Crisis resources could not be generated.";
    return response.trim();
  } catch (error) {
    console.error("severeAgent error:", error);
    return "Sorry, something went wrong generating crisis resources.";
  }
}
