import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export type TherapistResult = {
  name: string;
  location: string;
  contact: string;
  website: string;
};

export async function moderateAgent(locationInfo: string): Promise<string> {
  if (!locationInfo) return "";

  try {
    // 1. Refine search query broadly
    const refineCompletion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `
You specialize in generating effective search queries to find therapists, therapy centers, and counseling services.

Given a user's emotional situation and location:

- Create a broad but relevant search query that targets therapy resources nearby.
- Prioritize PsychologyToday, TherapyDen, Therapist.com, Rula, official clinic websites.
- Ignore Yelp, Healthgrades, generic directories.

Respond ONLY with a JSON like:

{
  "query": "therapists and counseling centers near San Ramon CA"
}
`,
        },
        {
          role: "user",
          content: `Situation & Location: ${locationInfo}`,
        },
      ],
    });

    const refineRaw = refineCompletion.choices[0].message.content ?? "{}";
    const refineJson = refineRaw.replace(/```json|```/g, "").trim();
    const { query: refinedQuery } = JSON.parse(refineJson);

    console.log("Refined query:", refinedQuery);

    // 2. Tavily search
    const searchResponse = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.TAVILY_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: refinedQuery,
        num_results: 10,
      }),
    });

    const searchResults = await searchResponse.json();

    console.log("Search results:", searchResults);

    if (!searchResults.results || searchResults.results.length === 0) {
      return "";
    }

    // 3. Summarize freely, no JSON restriction
    const summaryCompletion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `
You are an information extractor focused on finding helpful, real therapy-related resources.

Given a list of search results (titles, snippets, and URLs):

- Extract 5 to 8 helpful resources that are either:
    - Individual therapists
    - Therapy centers
    - Counseling services
    - Wellness clinics
    - Mental health organizations offering direct therapy services

- For each resource, write:

    Name: [name]
    Location: [city, state if visible]
    Contact: [phone/email if available, otherwise blank]
    Website: [official or most direct link available]

- It is acceptable to include resources from websites like PsychologyToday, TherapyDen, Therapist.com, Rula, or Yelp IF they clearly point to a specific therapist, center, or clinic.

- SKIP general listing pages, directory search results, top-10 articles, or generic links without clear contact or specific entities.

- If the link is a Yelp or directory page, only include it if it is about a **specific therapist, center, or clinic**.

- Always show website links as plain URLs (not in markdown format, no [text](link)).

- Separate each resource using "---".

- Keep entries short, clean, and directly helpful.

ONLY list the extracted resources. No commentary, no extra explanations.
`,
        },
        {
          role: "user",
          content: `Here are the search results: ${JSON.stringify(
            searchResults.results
          )}`,
        },
      ],
    });

    const cleanedSummary =
      summaryCompletion.choices[0].message.content?.trim() ?? "";

    return cleanedSummary;
  } catch (error) {
    console.error("moderateAgent error:", error);
    return "";
  }
}
