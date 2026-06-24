import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";

export async function POST(req: Request) {
  try {
    const { question } = await req.json();

    // Defensive check: never trust the request body. Bail early on bad input.
    if (!question || typeof question !== "string") {
      return Response.json(
        { error: "A question is required." },
        { status: 400 },
      );
    }

    const response = await generateText({
      model: openai("gpt-5.4-mini"), // confirm the exact id at platform.openai.com/docs/models; gpt-4o-mini also works
      prompt: question,
    });

    console.log("Response:", response);

    return Response.json({ answer: response.text });
  } catch (err) {
    console.error("Error in /api/ask:", err);
    return Response.json(
      { error: "Something went wrong generating the answer." },
      { status: 500 },
    );
  }
}
