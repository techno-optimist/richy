import { db, schema } from "../db";
import { like, desc, sql } from "drizzle-orm";
import { generateEmbedding, cosineSimilarity } from "./embeddings";

/** Escape SQL LIKE special characters to prevent wildcard injection */
function escapeLike(str: string): string {
  return str.replace(/%/g, "\\%").replace(/_/g, "\\_");
}

export interface MemorySearchResult {
  id: string;
  type: string;
  content: string;
  importance: number;
  similarity: number;
  createdAt: Date | null;
}

export async function semanticSearch(
  query: string,
  limit: number = 10,
  minSimilarity: number = 0.3
): Promise<MemorySearchResult[]> {
  const queryEmbedding = await generateEmbedding(query);

  // Get memories with embeddings (capped to prevent loading unbounded data)
  const memories = await db
    .select()
    .from(schema.memories)
    .orderBy(desc(schema.memories.updatedAt))
    .limit(500);

  // Compute similarities
  const results: MemorySearchResult[] = [];

  for (const memory of memories) {
    let similarity = 0;

    if (memory.embedding) {
      try {
        const memoryEmbedding: number[] = JSON.parse(memory.embedding);
        similarity = cosineSimilarity(queryEmbedding, memoryEmbedding);
      } catch {
        // Skip invalid embeddings
        continue;
      }
    } else {
      // Fallback: simple text matching score
      const queryLower = query.toLowerCase();
      const contentLower = memory.content.toLowerCase();
      const words = queryLower.split(/\s+/);
      const matchCount = words.filter((w) => contentLower.includes(w)).length;
      similarity = matchCount / words.length;
    }

    if (similarity >= minSimilarity) {
      results.push({
        id: memory.id,
        type: memory.type,
        content: memory.content,
        importance: memory.importance ?? 0.5,
        similarity,
        createdAt: memory.createdAt,
      });
    }
  }

  // Sort by similarity * importance weighting
  results.sort((a, b) => {
    const scoreA = a.similarity * (1 + a.importance / 10);
    const scoreB = b.similarity * (1 + b.importance / 10);
    return scoreB - scoreA;
  });

  return results.slice(0, limit);
}

export async function keywordSearch(
  query: string,
  limit: number = 10
): Promise<MemorySearchResult[]> {
  const words = query
    .split(/\s+/)
    .filter((w) => w.length > 2)
    .slice(0, 5);

  if (words.length === 0) return [];

  const results = await db
    .select()
    .from(schema.memories)
    .where(like(schema.memories.content, `%${escapeLike(words[0])}%`))
    .orderBy(desc(schema.memories.updatedAt))
    .limit(limit * 2);

  // Re-rank by how many query words match
  const scored = results.map((m) => {
    const contentLower = m.content.toLowerCase();
    const matchCount = words.filter((w) =>
      contentLower.includes(w.toLowerCase())
    ).length;
    return {
      id: m.id,
      type: m.type,
      content: m.content,
      importance: m.importance ?? 5,
      similarity: matchCount / words.length,
      createdAt: m.createdAt,
    };
  });

  scored.sort((a, b) => b.similarity - a.similarity);
  return scored.slice(0, limit);
}

export async function getRelevantMemories(
  conversationContext: string,
  limit: number = 10
): Promise<MemorySearchResult[]> {
  try {
    // Try semantic search first
    const results = await semanticSearch(conversationContext, limit, 0.25);
    if (results.length >= 3) return results;

    // Supplement with keyword search
    const keywordResults = await keywordSearch(conversationContext, limit);
    const existingIds = new Set(results.map((r) => r.id));
    for (const kr of keywordResults) {
      if (!existingIds.has(kr.id)) {
        results.push(kr);
      }
    }
    return results.slice(0, limit);
  } catch {
    // Fallback to keyword only
    return keywordSearch(conversationContext, limit);
  }
}
