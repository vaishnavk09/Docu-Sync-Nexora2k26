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
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return "Please set GEMINI_API_KEY in your .env file to enable summarization.";
  }

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: `Summarize the following text in 3-5 concise bullet points:\n\n${text}`,
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Gemini API Error:", response.status, response.statusText, errorText);
      return "Unable to generate summary at this time (API Error).";
    }

    const data = await response.json();
    return data?.candidates?.[0]?.content?.parts?.[0]?.text || "Empty response from AI.";
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
