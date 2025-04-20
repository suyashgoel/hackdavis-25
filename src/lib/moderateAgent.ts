import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function moderateAgent(locationInfo: string) {
  if (locationInfo) {
    // 1. Refine search query
    const refinedQueryCompletion = await openai.chat.completions.create({
      model: "gpt-4o",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `
You specialize in creating local therapist search queries.

Given a user's situation and location, generate a short search query.

Respond ONLY with a JSON object like:

{
  "query": "best anxiety therapists near San Ramon CA"
}

Respond ONLY with JSON — no extra commentary.
`,
        },
        {
          role: "user",
          content: `Situation & Location: ${locationInfo}`,
        },
      ],
    });

    const refinedQueryJson =
      refinedQueryCompletion.choices[0].message.content ?? "{}";
    const { query: refinedQuery } = JSON.parse(refinedQueryJson);

    console.log("Refined query:", refinedQuery);

    // 2. Tavily search
    const searchResults = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.TAVILY_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: refinedQuery,
        num_results: 5,
      }),
    }).then((res) => res.json());

    console.log("Search results:", searchResults);

    // 3. Summarize into structured therapist results
    const summaryCompletion = await openai.chat.completions.create({
      model: "gpt-4o",
      response_format: { type: "json_object" }, // you can also use this for the summary
      messages: [
        {
          role: "system",
          content: `
You act as a structured information extractor.

Given therapist search results, extract up to 5 local centers or therapists into a JSON array with this format:

[
  {
    "name": therapist or center name,
    "location": city and state,
    "contact": phone number if available (otherwise blank),
    "website": website if available (otherwise blank)
  }
]

Respond ONLY with a JSON array. No markdown, no extra commentary.
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

    const cleanJsonReply = summaryCompletion.choices[0].message.content;

    try {
      const cleaned =
        cleanJsonReply?.replace(/```json|```/g, "").trim() ?? "[]";
      const parsedJson = JSON.parse(cleaned);
      return parsedJson;
    } catch (e) {
      console.error("Failed to parse JSON from OpenAI:", e);
      return [];
    }
  }
}
