import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { getSettingSync } from "../db/settings";

export function getModel() {
  const provider = getSettingSync("ai_provider") || "anthropic";
  const modelId =
    getSettingSync("ai_model") || "claude-sonnet-4-20250514";
  const apiKey = getSettingSync("ai_api_key") || "";

  if (!apiKey) {
    throw new Error("No API key configured. Visit Settings to add one.");
  }

  switch (provider) {
    case "anthropic": {
      const anthropic = createAnthropic({ apiKey, baseURL: "https://api.anthropic.com/v1" });
      return anthropic(modelId);
    }
    case "openai": {
      const openai = createOpenAI({ apiKey });
      return openai(modelId);
    }
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}

/**
 * Create an Ollama model instance via the OpenAI-compatible API.
 */
function getOllamaModel(modelId: string) {
  const ollamaUrl = getSettingSync("ollama_base_url") || "http://localhost:11434/v1";
  const ollama = createOpenAI({
    baseURL: ollamaUrl,
    apiKey: "ollama",
    fetch: async (url, opts) => {
      // Inject num_ctx into request body — Ollama defaults to 4096 which is too
      // small for sentinel prompts with web research data
      if (opts?.body && typeof opts.body === "string") {
        try {
          const body = JSON.parse(opts.body);
          body.num_ctx = 32768;
          opts = { ...opts, body: JSON.stringify(body) };
        } catch {}
      }
      return globalThis.fetch(url, opts);
    },
  });
  // Use .chat() for Chat Completions API — the default uses the Responses API
  // which Ollama doesn't support properly
  return ollama.chat(modelId);
}

/**
 * Get the model for background/autonomous tasks (iMessage, sentinel, scheduler).
 * Supports Ollama for zero-cost local inference.
 * Falls back to the main model if no background model is configured.
 */
export function getBackgroundModel() {
  const bgProvider = getSettingSync("ai_background_provider") || "";
  const bgModel = getSettingSync("ai_background_model") || "";

  if (!bgModel) return getModel(); // fallback to main model

  // Ollama — free local inference
  if (bgProvider === "ollama") {
    return getOllamaModel(bgModel);
  }

  // Otherwise use the main provider with a different model
  const provider = bgProvider || getSettingSync("ai_provider") || "anthropic";
  const apiKey = getSettingSync("ai_api_key") || "";

  if (!apiKey) {
    throw new Error("No API key configured. Visit Settings to add one.");
  }

  switch (provider) {
    case "anthropic": {
      const anthropic = createAnthropic({ apiKey, baseURL: "https://api.anthropic.com/v1" });
      return anthropic(bgModel);
    }
    case "openai": {
      const openai = createOpenAI({ apiKey });
      return openai(bgModel);
    }
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}

export function getModelFromConfig(config: {
  provider: string;
  apiKey: string;
  model: string;
}) {
  switch (config.provider) {
    case "anthropic": {
      const anthropic = createAnthropic({ apiKey: config.apiKey, baseURL: "https://api.anthropic.com/v1" });
      return anthropic(config.model);
    }
    case "openai": {
      const openai = createOpenAI({ apiKey: config.apiKey });
      return openai(config.model);
    }
    default:
      throw new Error(`Unknown provider: ${config.provider}`);
  }
}

export function getMaxSteps(): number {
  const steps = getSettingSync("max_steps");
  return typeof steps === "number" ? steps : 10;
}

export function getRichyName(): string {
  return getSettingSync("buddy_name") || "Richy";
}

export function getPersonality(): string {
  return getSettingSync("personality") || "";
}
