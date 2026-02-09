import { generateText, stepCountIs } from "ai";
import { getModel, getBackgroundModel, getMaxSteps } from "./providers";
import { getSettingSync } from "../db/settings";
import { buildSystemPrompt } from "./system-prompt";
import { getToolsForAgent } from "../tools/registry";
import { db, schema } from "../db";
import { eq, desc } from "drizzle-orm";
import { nanoid } from "nanoid";
import { extractAndStoreMemories } from "../memory/extraction";

export interface AgentRunOptions {
  conversationId: string;
  userMessage: string;
  /** Extra context appended to system prompt (e.g. "via iMessage") */
  systemContext?: string;
  /** Max history messages to load (default 10, use 0 for stateless) */
  historyLimit?: number;
  /** Skip memory extraction after response (default false) */
  skipMemoryExtraction?: boolean;
  /** Force using the main model (Claude) instead of the background model */
  useMainModel?: boolean;
  /** Override the system prompt entirely (skips buildSystemPrompt) */
  systemPromptOverride?: string;
  /** Only register these tools by name (empty array = no tools) */
  toolFilter?: string[];
}

export interface AgentRunResult {
  text: string;
  conversationId: string;
}

/**
 * Run the full agent pipeline (non-streaming).
 * Used by iMessage polling and task scheduler.
 * Mirrors api/chat/route.ts but uses generateText() instead of streamText().
 */
export async function runAgent(
  options: AgentRunOptions
): Promise<AgentRunResult> {
  const { conversationId, userMessage, systemContext, historyLimit = 10, skipMemoryExtraction = false, useMainModel = false } = options;

  // Ensure conversation exists
  const existing = await db
    .select()
    .from(schema.conversations)
    .where(eq(schema.conversations.id, conversationId))
    .limit(1);

  if (existing.length === 0) {
    await db.insert(schema.conversations).values({
      id: conversationId,
      title: "New conversation",
    });
  }

  // Save the user message
  const userMsgId = nanoid();
  await db.insert(schema.messages).values({
    id: userMsgId,
    conversationId,
    role: "user",
    content: userMessage,
  });

  // Load conversation history for context
  let conversationMessages: { role: "user" | "assistant"; content: string }[] = [];
  if (historyLimit > 0) {
    const history = await db
      .select()
      .from(schema.messages)
      .where(eq(schema.messages.conversationId, conversationId))
      .orderBy(desc(schema.messages.createdAt))
      .limit(historyLimit);

    conversationMessages = history
      .reverse()
      .map((msg) => ({
        role: msg.role as "user" | "assistant",
        content: msg.content || "",
      }))
      .filter((msg) => msg.role === "user" || msg.role === "assistant");
  } else {
    // Stateless: only the current message
    conversationMessages = [{ role: "user", content: userMessage }];
  }

  // Build system prompt with memory context (or use override)
  const systemPrompt = options.systemPromptOverride
    ?? await buildSystemPrompt(userMessage, systemContext);

  // Only pass tools when using Claude — Ollama doesn't support AI SDK multi-step tool calling
  const isMainModel = useMainModel || !getSettingSync("ai_background_model");
  const allTools = isMainModel ? getToolsForAgent() : {};
  const tools = options.toolFilter !== undefined
    ? Object.fromEntries(Object.entries(allTools).filter(([name]) => options.toolFilter!.includes(name)))
    : allTools;

  // Run agent — use main model (Claude) for code/tool tasks, background model for the rest
  const result = await generateText({
    model: useMainModel ? getModel() : getBackgroundModel(),
    system: systemPrompt,
    messages: conversationMessages,
    ...(Object.keys(tools).length > 0 ? { tools, stopWhen: stepCountIs(getMaxSteps()) } : {}),
  });

  const responseText =
    result.text || "I completed the task but have nothing to report.";

  // Build parts array from all steps (tool calls + final text)
  const parts: any[] = [];
  for (const step of result.steps) {
    for (const tc of step.toolCalls) {
      const tr = step.toolResults.find(
        (r: any) => r.toolCallId === tc.toolCallId
      );
      parts.push({
        type: "tool-invocation",
        toolName: tc.toolName,
        toolCallId: tc.toolCallId,
        state: tr ? "output-available" : "output-error",
        input: tc.input,
        output: tr?.output,
      });
    }
  }
  if (result.text) {
    parts.push({ type: "text", text: result.text });
  }

  // Save assistant response with full parts
  await db.insert(schema.messages).values({
    id: nanoid(),
    conversationId,
    role: "assistant",
    content: responseText,
    parts: parts.length > 0 ? JSON.stringify(parts) : null,
    tokenUsage: JSON.stringify(result.usage),
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
    const title =
      userMessage.length > 50
        ? userMessage.substring(0, 50) + "..."
        : userMessage || "New conversation";
    await db
      .update(schema.conversations)
      .set({ title })
      .where(eq(schema.conversations.id, conversationId));
  }

  // Extract memories (non-blocking, skipped for background tasks to save tokens)
  if (!skipMemoryExtraction) {
    extractAndStoreMemories(userMessage, responseText, conversationId).catch(
      () => {}
    );
  }

  return { text: responseText, conversationId };
}
