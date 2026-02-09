import { generateText } from "ai";
import { getModelFromConfig } from "@/server/agent/providers";

export async function POST(req: Request) {
  try {
    const { provider, apiKey, model } = await req.json();

    const aiModel = getModelFromConfig({ provider, apiKey, model });

    const { text } = await generateText({
      model: aiModel,
      prompt: "Say 'connected' in one word.",
      maxOutputTokens: 10,
    });

    return Response.json({ success: true, response: text });
  } catch (error: any) {
    return Response.json(
      { success: false, error: error.message },
      { status: 400 }
    );
  }
}
