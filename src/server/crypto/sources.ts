import { getSettingSync } from "../db/settings";

// ─── Types ──────────────────────────────────────────────────────────

export interface FirecrawlResult {
  title: string;
  url: string;
  description: string;
  markdown: string;
}

export interface RedditPost {
  title: string;
  score: number;
  numComments: number;
  selftext: string;
  createdUtc: number;
  subreddit: string;
  permalink: string;
}

export interface CryptoNewsItem {
  title: string;
  url: string;
  source: string;
  publishedAt: string;
  votesPositive: number;
  votesNegative: number;
  votesImportant: number;
}

// ─── Firecrawl ──────────────────────────────────────────────────────

/**
 * Search the web via Firecrawl API.
 * Returns search results with scraped markdown content included.
 */
export async function firecrawlSearch(
  query: string,
  limit: number = 5
): Promise<FirecrawlResult[]> {
  const apiKey = getSettingSync("firecrawl_api_key");
  if (!apiKey) return [];

  try {
    const response = await fetch("https://api.firecrawl.dev/v2/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        query,
        limit,
        scrapeOptions: {
          formats: ["markdown"],
          onlyMainContent: true,
        },
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      console.error(`[Richy:Sources] Firecrawl search failed: HTTP ${response.status}`);
      return [];
    }

    const json = await response.json();
    if (!json.success || !json.data) return [];

    const results: FirecrawlResult[] = [];
    const items = Array.isArray(json.data) ? json.data : json.data.web || [];

    for (const item of items) {
      results.push({
        title: item.title || "Untitled",
        url: item.url || "",
        description: item.description || "",
        markdown: (item.markdown || "").substring(0, 2000),
      });
    }

    return results;
  } catch (err: any) {
    console.error(`[Richy:Sources] Firecrawl error: ${err.message}`);
    return [];
  }
}

// ─── Reddit ─────────────────────────────────────────────────────────

const COIN_SUBREDDITS: Record<string, string[]> = {
  BTC: ["bitcoin", "CryptoMarkets"],
  ETH: ["ethereum", "CryptoMarkets"],
  SOL: ["solana", "CryptoMarkets"],
  DOGE: ["dogecoin", "CryptoMarkets"],
  XRP: ["Ripple", "CryptoMarkets"],
  ADA: ["cardano", "CryptoMarkets"],
};
const DEFAULT_SUBREDDITS = ["cryptocurrency", "CryptoMarkets"];

/**
 * Fetch hot posts from relevant subreddits for the given coins.
 * Uses Reddit's public JSON API (no auth needed).
 */
export async function fetchRedditSentiment(
  coins: string[]
): Promise<RedditPost[]> {
  const allPosts: RedditPost[] = [];
  const seenSubreddits = new Set<string>();

  // Collect unique subreddits for all coins
  const subreddits: string[] = [];
  for (const coin of coins) {
    const subs = COIN_SUBREDDITS[coin.toUpperCase()] || DEFAULT_SUBREDDITS;
    for (const sub of subs) {
      if (!seenSubreddits.has(sub)) {
        seenSubreddits.add(sub);
        subreddits.push(sub);
      }
    }
  }

  for (const subreddit of subreddits) {
    try {
      const response = await fetch(
        `https://www.reddit.com/r/${subreddit}/hot.json?limit=10`,
        {
          headers: {
            "User-Agent": "RichyBot/1.0 (crypto sentiment monitor)",
          },
          signal: AbortSignal.timeout(10000),
        }
      );

      if (!response.ok) continue;

      const json = await response.json();
      const posts = json?.data?.children || [];

      for (const child of posts) {
        const post = child.data;
        if (!post || post.stickied) continue;

        allPosts.push({
          title: post.title || "",
          score: post.score || 0,
          numComments: post.num_comments || 0,
          selftext: (post.selftext || "").substring(0, 300),
          createdUtc: post.created_utc || 0,
          subreddit: post.subreddit || subreddit,
          permalink: post.permalink || "",
        });
      }

      // Rate limit: 1s between requests
      if (subreddits.indexOf(subreddit) < subreddits.length - 1) {
        await new Promise((r) => setTimeout(r, 1000));
      }
    } catch (err: any) {
      console.error(`[Richy:Sources] Reddit r/${subreddit} error: ${err.message}`);
    }
  }

  // Sort by score descending, return top 15
  return allPosts.sort((a, b) => b.score - a.score).slice(0, 15);
}

// ─── CryptoPanic ────────────────────────────────────────────────────

/**
 * Fetch crypto news from CryptoPanic API.
 * Requires a free API key from cryptopanic.com/developers/api
 */
export async function fetchCryptoNews(
  coins: string[]
): Promise<CryptoNewsItem[]> {
  const apiKey = getSettingSync("crypto_panic_api_key");
  if (!apiKey) return [];

  try {
    const currencies = coins.map((c) => c.toUpperCase()).join(",");
    const response = await fetch(
      `https://cryptopanic.com/api/v1/posts/?auth_token=${apiKey}&currencies=${currencies}&kind=news&public=true`,
      { signal: AbortSignal.timeout(10000) }
    );

    if (!response.ok) {
      console.error(`[Richy:Sources] CryptoPanic failed: HTTP ${response.status}`);
      return [];
    }

    const json = await response.json();
    const results = json?.results || [];

    return results.slice(0, 10).map((item: any) => ({
      title: item.title || "",
      url: item.url || "",
      source: item.source?.title || "Unknown",
      publishedAt: item.published_at || "",
      votesPositive: item.votes?.positive || 0,
      votesNegative: item.votes?.negative || 0,
      votesImportant: item.votes?.important || 0,
    }));
  } catch (err: any) {
    console.error(`[Richy:Sources] CryptoPanic error: ${err.message}`);
    return [];
  }
}
