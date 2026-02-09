import { z } from "zod/v4";
import type { RichyToolDef } from "../types";

export const webSearchTool: RichyToolDef = {
  name: "web_search",
  displayName: "Web Search",
  description:
    "Search the web for current information. Returns titles, URLs, and snippets from search results.",
  category: "web",
  parameters: z.object({
    query: z.string().describe("The search query"),
    maxResults: z
      .number()
      .min(1)
      .max(10)
      .optional()
      .describe("Maximum number of results (default 5)"),
  }),
  execute: async (input: { query: string; maxResults?: number }) => {
    // Use a free search API or scrape DuckDuckGo
    try {
      const response = await fetch(
        `https://html.duckduckgo.com/html/?q=${encodeURIComponent(input.query)}`,
        {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (compatible; RichyBot/1.0; +http://localhost)",
          },
        }
      );
      const html = await response.text();

      // Parse results from DDG HTML
      const results: { title: string; url: string; snippet: string }[] = [];
      const resultRegex =
        /<a[^>]*class="result__a"[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>[\s\S]*?<a[^>]*class="result__snippet"[^>]*>(.*?)<\/a>/g;

      let match;
      const max = input.maxResults ?? 5;
      while ((match = resultRegex.exec(html)) !== null && results.length < max) {
        // DDG proxies URLs through a redirect
        let url = match[1];
        const uddg = url.match(/uddg=([^&]+)/);
        if (uddg) {
          url = decodeURIComponent(uddg[1]);
        }

        results.push({
          title: match[2].replace(/<[^>]*>/g, "").trim(),
          url,
          snippet: match[3].replace(/<[^>]*>/g, "").trim(),
        });
      }

      if (results.length === 0) {
        return {
          success: true,
          output: `No results found for "${input.query}"`,
          data: { results: [] },
        };
      }

      const formatted = results
        .map((r, i) => `${i + 1}. **${r.title}**\n   ${r.url}\n   ${r.snippet}`)
        .join("\n\n");

      return {
        success: true,
        output: `Search results for "${input.query}":\n\n${formatted}`,
        data: { results },
      };
    } catch (error: any) {
      return {
        success: false,
        output: `Search failed: ${error.message}`,
      };
    }
  },
};
