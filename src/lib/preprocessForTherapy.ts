import OpenAI from 'openai'

export async function preprocessForTherapy(rawTranscript: string): Promise<string> {
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  
    const therapyShaped = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        {
          role: "system",
          content: `
  You are a therapy session text processor.
  
  Given a raw transcription (even if messy, partial, or background noise mixed in), 
  your job is to extract any real emotional, mental health related message from it.
  
  - If the text is random noise, background sounds, or has no emotional or therapy-related content, respond ONLY with: "NO_MEANINGFUL_CONTENT"
  - If there IS real emotional, mental health content (even partial), REPHRASE it clearly into a short 1-2 sentence therapy-style statement.
  - Be empathetic, clear, and only keep the important part.
  - Remove any irrelevant sounds, noise, music mentions, etc.
  - Keep the response in first person, as if you are the user voicing these thoughts.
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
  