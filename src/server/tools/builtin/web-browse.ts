import { z } from "zod/v4";
import * as cheerio from "cheerio";
import type { RichyToolDef } from "../types";

export const webBrowseTool: RichyToolDef = {
  name: "web_browse",
  displayName: "Web Browse",
  description:
    "Fetch and read the content of a web page. Returns the text content of the page, useful for reading articles, documentation, etc.",
  category: "web",
  parameters: z.object({
    url: z.string().describe("The URL to fetch"),
    selector: z
      .string()
      .optional()
      .describe("Optional CSS selector to extract specific content"),
  }),
  execute: async (input: { url: string; selector?: string }) => {
    try {
      // Validate URL scheme to prevent SSRF (file://, data://, localhost, etc.)
      let parsed: URL;
      try {
        parsed = new URL(input.url);
      } catch {
        return { success: false, output: "Invalid URL" };
      }
      if (!["http:", "https:"].includes(parsed.protocol)) {
        return { success: false, output: "Only http and https URLs are allowed" };
      }
      const hostname = parsed.hostname.toLowerCase();
      if (
        hostname === "localhost" ||
        hostname === "0.0.0.0" ||
        hostname === "[::1]" ||
        hostname === "::1" ||
        hostname.startsWith("127.") ||
        hostname.startsWith("192.168.") ||
        hostname.startsWith("10.") ||
        hostname.startsWith("172.") ||
        hostname.startsWith("169.254.") ||
        hostname.startsWith("fd") || // IPv6 unique local
        hostname.startsWith("fe80") // IPv6 link-local
      ) {
        return { success: false, output: "Cannot browse internal/private network addresses" };
      }

      const response = await fetch(input.url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (compatible; RichyBot/1.0; +http://localhost)",
          Accept: "text/html,application/xhtml+xml",
        },
        signal: AbortSignal.timeout(15000),
      });

      if (!response.ok) {
        return {
          success: false,
          output: `Failed to fetch URL: HTTP ${response.status}`,
        };
      }

      const html = await response.text();
      const $ = cheerio.load(html);

      // Remove scripts, styles, and navigation
      $("script, style, nav, footer, header, iframe, noscript").remove();

      let text: string;
      if (input.selector) {
        text = $(input.selector).text();
      } else {
        // Try to find main content
        const mainContent =
          $("article").text() ||
          $("main").text() ||
          $('[role="main"]').text() ||
          $("body").text();
        text = mainContent;
      }

      // Clean up whitespace
      text = text.replace(/\s+/g, " ").trim();

      // Truncate to avoid context overflow
      const maxLen = 8000;
      if (text.length > maxLen) {
        text = text.slice(0, maxLen) + "\n\n[Content truncated...]";
      }

      const title = $("title").text().trim() || "Untitled";

      return {
        success: true,
        output: `**${title}**\n\n${text}`,
        data: { title, url: input.url, length: text.length },
      };
    } catch (error: any) {
      return {
        success: false,
        output: `Failed to browse URL: ${error.message}`,
      };
    }
  },
};
