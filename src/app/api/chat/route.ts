import { streamText, stepCountIs, convertToModelMessages } from "ai";
import { getModel, getMaxSteps } from "@/server/agent/providers";
import { buildSystemPrompt } from "@/server/agent/system-prompt";
import { getToolsForAgent } from "@/server/tools/registry";
import { db, schema } from "@/server/db";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { extractAndStoreMemories } from "@/server/memory/extraction";

/** Normalize a UIMessage part for DB storage */
function normalizePart(part: any): any | null {
  if (part.type === "text") {
    return { type: "text", text: part.text };
  }
  if (part.type === "step-start") {
    return null; // skip step boundaries
  }
  // Handle v6 tool parts: "tool-<name>" or "dynamic-tool"
  if (part.type === "dynamic-tool" || part.type?.startsWith("tool-")) {
    const toolName =
      part.type === "dynamic-tool"
        ? part.toolName
        : part.type.slice(5); // strip "tool-" prefix
    return {
      type: "tool-invocation",
      toolName,
      toolCallId: part.toolCallId,
      state: part.state,
      input: part.input,
      output: part.output,
      errorText: part.errorText,
    };
  }
  // Pass through other types (reasoning, source, file, etc.)
  return part;
}

export async function POST(req: Request) {
  // Rate limiting
  const { checkRateLimit } = await import("@/server/trpc/init");
  const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "127.0.0.1";
  if (!checkRateLimit(ip)) {
    return new Response("Rate limit exceeded", { status: 429 });
  }

  const { messages, conversationId } = await req.json();

  // Ensure conversation exists (upsert to avoid race condition)
  if (conversationId) {
    await db
      .insert(schema.conversations)
      .values({ id: conversationId, title: "New conversation" })
      .onConflictDoNothing()
      .run();
  }

  // Save the latest user message
  const lastMessage = messages[messages.length - 1];
  if (lastMessage?.role === "user" && conversationId) {
    let content = "";
    if (typeof lastMessage.content === "string") {
      content = lastMessage.content;
    } else if (lastMessage.parts) {
      content = lastMessage.parts
        .filter((p: any) => p.type === "text")
        .map((p: any) => p.text)
        .join("");
    }

    if (content) {
      await db.insert(schema.messages).values({
        id: nanoid(),
        conversationId,
        role: "user",
        content,
      });
    }
  }

  // Extract the latest user message text for context
  let userMessageText = "";
  const lastUserMsg = [...messages]
    .reverse()
    .find((m: any) => m.role === "user");
  if (lastUserMsg) {
    if (typeof lastUserMsg.content === "string") {
      userMessageText = lastUserMsg.content;
    } else if (lastUserMsg.parts) {
      userMessageText = lastUserMsg.parts
        .filter((p: any) => p.type === "text")
        .map((p: any) => p.text)
        .join("");
    }
  }

  const systemPrompt = await buildSystemPrompt(userMessageText || undefined);
  const tools = getToolsForAgent();

  // Strip incomplete tool invocations from history to avoid API errors
  // (e.g. when a previous session was interrupted mid-tool-call)
  const sanitizedMessages = messages.map((msg: any) => {
    if (msg.role !== "assistant" || !msg.parts) return msg;
    const cleanParts = msg.parts.filter((p: any) => {
      if (
        p.type === "tool-invocation" ||
        p.type === "dynamic-tool" ||
        p.type?.startsWith("tool-")
      ) {
        return p.state === "result";
      }
      return true;
    });
    // If all content was tool calls that got stripped, drop the message
    if (cleanParts.length === 0) return null;
    return { ...msg, parts: cleanParts };
  }).filter(Boolean);

  // Convert UI messages (with parts) to model messages (with content)
  const modelMessages = await convertToModelMessages(sanitizedMessages, { tools });

  const result = streamText({
    model: getModel(),
    system: systemPrompt,
    messages: modelMessages,
    tools,
    stopWhen: stepCountIs(getMaxSteps()),
  });

  return result.toUIMessageStreamResponse({
    onFinish: async ({ responseMessage }) => {
      if (!conversationId) return;

      // Extract plain text for content column (backward compat + memory)
      const textContent = responseMessage.parts
        .filter((p: any) => p.type === "text")
        .map((p: any) => p.text)
        .join("");

      // Normalize parts for storage
      const storedParts = responseMessage.parts
        .map(normalizePart)
        .filter(Boolean);

      await db.insert(schema.messages).values({
        id: responseMessage.id || nanoid(),
        conversationId,
        role: "assistant",
        content: textContent || null,
        parts: JSON.stringify(storedParts),
      });

      // Update conversation timestamp
      await db
        .update(schema.conversations)
        .set({ updatedAt: new Date() })
        .where(eq(schema.conversations.id, conversationId));

      // Auto-title on first exchange
      const msgCount = await db
        .select()
        .from(schema.messages)
        .where(eq(schema.messages.conversationId, conversationId));

      if (msgCount.length <= 2) {
        const userMsg = messages.find((m: any) => m.role === "user");
        if (userMsg) {
          let msgText = "";
          if (typeof userMsg.content === "string") {
            msgText = userMsg.content;
          } else if (userMsg.parts) {
            msgText = userMsg.parts
              .filter((p: any) => p.type === "text")
              .map((p: any) => p.text)
              .join("");
          }
          const title =
            msgText.length > 50
              ? msgText.substring(0, 50) + "..."
              : msgText || "New conversation";
          await db
            .update(schema.conversations)
            .set({ title })
            .where(eq(schema.conversations.id, conversationId));
        }
      }

      // Auto-extract memories from conversation (non-blocking)
      if (userMessageText && textContent) {
        extractAndStoreMemories(
          userMessageText,
          textContent,
          conversationId
        ).catch((err) => {
          console.error("[Richy:Memory] Extraction failed:", err.message);
        });
      }
    },
  });
}
