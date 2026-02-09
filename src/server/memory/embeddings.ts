import { db, schema } from "../db";
import { eq } from "drizzle-orm";

let pipeline: any = null;
let loadingPromise: Promise<any> | null = null;

async function getEmbeddingPipeline() {
  if (pipeline) return pipeline;
  if (loadingPromise) return loadingPromise;

  loadingPromise = (async () => {
    const { pipeline: createPipeline } = await import(
      "@huggingface/transformers"
    );
    pipeline = await createPipeline(
      "feature-extraction",
      "Xenova/all-MiniLM-L6-v2",
      { dtype: "fp32" }
    );
    return pipeline;
  })();

  return loadingPromise;
}

export async function generateEmbedding(text: string): Promise<number[]> {
  // Check if user wants API-based embeddings
  const embeddingMethod = await getSettingValue("embedding_method");

  if (embeddingMethod === "api") {
    return generateAPIEmbedding(text);
  }

  return generateLocalEmbedding(text);
}

async function generateLocalEmbedding(text: string): Promise<number[]> {
  const extractor = await getEmbeddingPipeline();
  const result = await extractor(text, { pooling: "mean", normalize: true });
  return Array.from(result.data as Float32Array);
}

async function generateAPIEmbedding(text: string): Promise<number[]> {
  const provider = await getSettingValue("ai_provider");
  const apiKey = await getSettingValue("api_key");

  if (provider === "openai" && apiKey) {
    const response = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "text-embedding-3-small",
        input: text,
      }),
    });
    const data = await response.json();
    return data.data[0].embedding;
  }

  // Fallback to local
  return generateLocalEmbedding(text);
}

async function getSettingValue(key: string): Promise<string | null> {
  try {
    const result = await db
      .select()
      .from(schema.settings)
      .where(eq(schema.settings.key, key))
      .limit(1);
    if (result.length > 0) {
      try {
        return JSON.parse(result[0].value);
      } catch {
        return result[0].value;
      }
    }
  } catch {
    // table might not exist yet
  }
  return null;
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}
