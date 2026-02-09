import { db, schema } from "../db";
import { nanoid } from "nanoid";
import { generateEmbedding, cosineSimilarity } from "./embeddings";
import { desc } from "drizzle-orm";

interface ExtractedMemory {
  type: "fact" | "preference" | "pattern" | "note" | "entity";
  content: string;
  importance: number;
}

export async function extractAndStoreMemories(
  userMessage: string,
  assistantResponse: string,
  conversationId: string
): Promise<void> {
  // Extract potential memories from the conversation
  const memories = extractMemoriesFromText(userMessage, assistantResponse);

  for (const memory of memories) {
    // Check for duplicates using embedding similarity
    const isDuplicate = await checkDuplicate(memory.content);
    if (isDuplicate) continue;

    // Generate embedding
    let embedding: string | null = null;
    try {
      const vec = await generateEmbedding(memory.content);
      embedding = JSON.stringify(vec);
    } catch {
      // Continue without embedding
    }

    await db.insert(schema.memories).values({
      id: nanoid(),
      type: memory.type,
      content: memory.content,
      importance: memory.importance,
      embedding,
      source: "auto-extraction",
    });
  }
}

function extractMemoriesFromText(
  userMessage: string,
  _assistantResponse: string
): ExtractedMemory[] {
  const memories: ExtractedMemory[] = [];
  const msg = userMessage.trim();

  // Pattern: "My name is X" / "I'm X"
  const namePatterns = [
    /my name is (\w+[\w\s]*)/i,
    /i'm (\w+)(?:\s|$|,)/i,
    /call me (\w+)/i,
  ];
  for (const pattern of namePatterns) {
    const match = msg.match(pattern);
    if (match) {
      memories.push({
        type: "fact",
        content: `User's name is ${match[1].trim()}`,
        importance: 9,
      });
    }
  }

  // Pattern: "I live in X" / "I'm from X"
  const locationPatterns = [
    /i (?:live|am|stay) in ([^.!?,]+)/i,
    /i'm from ([^.!?,]+)/i,
    /based in ([^.!?,]+)/i,
  ];
  for (const pattern of locationPatterns) {
    const match = msg.match(pattern);
    if (match) {
      memories.push({
        type: "fact",
        content: `User lives in / is from ${match[1].trim()}`,
        importance: 7,
      });
    }
  }

  // Pattern: "I work as/at X" / "I'm a X (profession)"
  const workPatterns = [
    /i (?:work|am working) (?:as|at|for) ([^.!?,]+)/i,
    /i'm an? ([\w\s]+?(?:engineer|developer|designer|manager|teacher|doctor|lawyer|nurse|scientist|writer|artist|student|consultant|analyst|architect))/i,
    /my job is ([^.!?,]+)/i,
  ];
  for (const pattern of workPatterns) {
    const match = msg.match(pattern);
    if (match) {
      memories.push({
        type: "fact",
        content: `User works as/at ${match[1].trim()}`,
        importance: 7,
      });
    }
  }

  // Pattern: Preferences - "I like/love/prefer/enjoy X"
  const prefPatterns = [
    /i (?:like|love|prefer|enjoy|am into|am a fan of) ([^.!?,]+)/i,
    /my favorite (\w+) is ([^.!?,]+)/i,
  ];
  for (const pattern of prefPatterns) {
    const match = msg.match(pattern);
    if (match) {
      if (match[2]) {
        memories.push({
          type: "preference",
          content: `User's favorite ${match[1]} is ${match[2].trim()}`,
          importance: 6,
        });
      } else {
        memories.push({
          type: "preference",
          content: `User likes/enjoys ${match[1].trim()}`,
          importance: 5,
        });
      }
    }
  }

  // Pattern: Dislikes - "I don't like/hate X"
  const dislikePatterns = [
    /i (?:don't like|hate|dislike|can't stand) ([^.!?,]+)/i,
  ];
  for (const pattern of dislikePatterns) {
    const match = msg.match(pattern);
    if (match) {
      memories.push({
        type: "preference",
        content: `User dislikes ${match[1].trim()}`,
        importance: 5,
      });
    }
  }

  // Pattern: Important dates - "my birthday is X"
  const datePatterns = [
    /my birthday is ([^.!?,]+)/i,
    /(?:my|our) anniversary is ([^.!?,]+)/i,
  ];
  for (const pattern of datePatterns) {
    const match = msg.match(pattern);
    if (match) {
      memories.push({
        type: "fact",
        content: `User's ${pattern.source.includes("birthday") ? "birthday" : "anniversary"} is ${match[1].trim()}`,
        importance: 8,
      });
    }
  }

  return memories;
}

async function checkDuplicate(content: string): Promise<boolean> {
  try {
    // Get recent memories
    const existing = await db
      .select()
      .from(schema.memories)
      .orderBy(desc(schema.memories.createdAt))
      .limit(50);

    // Check for exact or near-exact matches
    const contentLower = content.toLowerCase();
    for (const m of existing) {
      if (m.content.toLowerCase() === contentLower) return true;

      // Simple overlap check (Jaccard-ish)
      const words1 = new Set(contentLower.split(/\s+/));
      const words2 = new Set(m.content.toLowerCase().split(/\s+/));
      const intersection = [...words1].filter((w) => words2.has(w)).length;
      const union = new Set([...words1, ...words2]).size;
      if (union > 0 && intersection / union > 0.8) return true;
    }

    // Also check via embedding similarity if available
    try {
      const newEmbedding = await generateEmbedding(content);
      for (const m of existing) {
        if (m.embedding) {
          const existingEmbedding: number[] = JSON.parse(m.embedding);
          const sim = cosineSimilarity(newEmbedding, existingEmbedding);
          if (sim > 0.92) return true;
        }
      }
    } catch {
      // Skip embedding check
    }
  } catch {
    // Table may not exist yet
  }

  return false;
}
