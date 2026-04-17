import { NextResponse } from "next/server";

// Recursive function to extract plain text from Tiptap JSON
function extractText(node: any): string {
  if (!node) return "";
  if (node.type === "text") return node.text || "";
  if (!node.content) return "";
  return node.content.map(extractText).join(" ");
}

// Stub function to call generic AI model via HTTP fetch avoiding extra dependencies
async function generateSummary(text: string): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY;

  if (!apiKey) {
    return "Please set GROQ_API_KEY in your .env file to enable summarization.";
  }

  try {
    const response = await fetch(`https://api.groq.com/openai/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant",
        messages: [
          {
            role: "user",
            content: `Summarize the following text in 3-5 concise bullet points:\n\n${text}`,
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Groq API Error:", response.status, response.statusText, errorText);
      return "Unable to generate summary at this time (API Error).";
    }

    const data = await response.json();
    return data?.choices?.[0]?.message?.content || "Empty response from AI.";
  } catch (error) {
    return "Failed to connect to AI service.";
  }
}

export async function POST(req: Request) {
  try {
    const { content } = await req.json();

    const text = extractText(content);

    if (!text || text.trim().length < 20) {
      return NextResponse.json({ summary: "Not enough content to summarize." });
    }

    const summary = await generateSummary(text);

    return NextResponse.json({ summary });
  } catch (error) {
    return NextResponse.json(
      { summary: "An error occurred while generating the summary." },
      { status: 500 }
    );
  }
}
