"use client";

import { useState, memo } from "react";
import {
  Search,
  Globe,
  Calculator,
  Brain,
  Code,
  Terminal,
  FileText,
  CheckCircle2,
  XCircle,
  ChevronDown,
  ChevronRight,
  Wrench,
  Loader2,
  ExternalLink,
  MessageSquare,
  ListTodo,
  TrendingUp,
  TrendingDown,
  DollarSign,
  AlertTriangle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface ToolResultProps {
  toolName: string;
  input: any;
  output: any;
  state: string;
  errorText?: string;
}

// Parse tool output — handles both old format (string) and new format (object)
function parseOutput(output: any): {
  success: boolean;
  text: string;
  data?: any;
} {
  if (!output) return { success: true, text: "" };
  if (typeof output === "string") return { success: true, text: output };
  if (typeof output === "object") {
    return {
      success: output.success !== false,
      text: output.output || JSON.stringify(output),
      data: output.data,
    };
  }
  return { success: true, text: String(output) };
}

// Tool icon mapping
function getToolIcon(toolName: string) {
  const icons: Record<string, any> = {
    web_search: Search,
    web_browse: Globe,
    calculator: Calculator,
    memory_store: Brain,
    code_execute: Code,
    self_modify: Terminal,
    task_manage: ListTodo,
    imessage: MessageSquare,
    telegram: MessageSquare,
    tool_create: Wrench,
    crypto_trade: TrendingUp,
  };
  return icons[toolName] || Wrench;
}

// ─── Main Dispatcher ────────────────────────────────────────────────
export const ToolResultRenderer = memo(function ToolResultRenderer({
  toolName,
  input,
  output,
  state,
  errorText,
}: ToolResultProps) {
  // Loading state — tool is being called
  if (state === "input-streaming" || state === "input-available") {
    return <ToolLoading toolName={toolName} />;
  }

  // Error state
  if (state === "output-error" || errorText) {
    return <ToolError toolName={toolName} error={errorText} />;
  }

  const result = parseOutput(output);

  // Dispatch to specific renderer
  switch (toolName) {
    case "web_search":
      return <WebSearchResult result={result} />;
    case "web_browse":
      return <WebBrowseResult result={result} />;
    case "calculator":
      return <CalculatorResult input={input} result={result} />;
    case "memory_store":
      return <MemoryStoreResult input={input} result={result} />;
    case "code_execute":
      return <CodeExecuteResult input={input} result={result} />;
    case "self_modify":
      return <SelfModifyResult input={input} result={result} />;
    case "task_manage":
      return <TaskManageResult input={input} result={result} />;
    case "crypto_trade":
      return <CryptoTradeResult input={input} result={result} />;
    default:
      return (
        <GenericToolResult
          toolName={toolName}
          input={input}
          result={result}
        />
      );
  }
});

// ─── Loading State ──────────────────────────────────────────────────
function ToolLoading({ toolName }: { toolName: string }) {
  const Icon = getToolIcon(toolName);
  return (
    <div className="my-2 flex items-center gap-2 rounded-lg border bg-muted/30 p-2 text-sm text-muted-foreground">
      <Loader2 className="h-3.5 w-3.5 animate-spin" />
      <Icon className="h-3.5 w-3.5" />
      <span className="font-mono text-xs">{toolName}</span>
    </div>
  );
}

// ─── Error State ────────────────────────────────────────────────────
function ToolError({
  toolName,
  error,
}: {
  toolName: string;
  error?: string;
}) {
  return (
    <div className="my-2 rounded-lg border border-red-500/20 bg-red-500/5 p-3 text-sm">
      <div className="flex items-center gap-2 text-red-500">
        <XCircle className="h-3.5 w-3.5" />
        <span className="font-mono text-xs">{toolName}</span>
        <span className="text-xs">failed</span>
      </div>
      {error && (
        <p className="mt-1 text-xs text-red-400/80">{error}</p>
      )}
    </div>
  );
}

// ─── Web Search ─────────────────────────────────────────────────────
function WebSearchResult({
  result,
}: {
  result: { success: boolean; text: string; data?: any };
}) {
  const results = result.data?.results;

  if (!results || !Array.isArray(results)) {
    return <GenericToolResult toolName="web_search" result={result} />;
  }

  return (
    <div className="my-2 space-y-1.5">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Search className="h-3 w-3" />
        <span>{results.length} results</span>
      </div>
      {results.slice(0, 5).map((r: any, i: number) => (
        <a
          key={i}
          href={r.url}
          target="_blank"
          rel="noopener noreferrer"
          className="block rounded-lg border bg-muted/20 p-2.5 transition-colors hover:bg-muted/40"
        >
          <div className="flex items-start gap-1.5">
            <span className="text-sm font-medium text-foreground leading-tight">
              {r.title}
            </span>
            <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground mt-0.5" />
          </div>
          <p className="mt-0.5 text-xs text-primary/70 truncate">{r.url}</p>
          {r.snippet && (
            <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
              {r.snippet}
            </p>
          )}
        </a>
      ))}
    </div>
  );
}

// ─── Web Browse ─────────────────────────────────────────────────────
function WebBrowseResult({
  result,
}: {
  result: { success: boolean; text: string; data?: any };
}) {
  const [expanded, setExpanded] = useState(false);
  const title = result.data?.title;
  const url = result.data?.url;
  const length = result.data?.length;

  return (
    <div className="my-2 rounded-lg border bg-muted/20">
      <button
        className="flex w-full items-center gap-2 p-2.5 text-left hover:bg-muted/40 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <Globe className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">
            {title || "Web Page"}
          </p>
          {url && (
            <p className="text-xs text-primary/70 truncate">{url}</p>
          )}
        </div>
        {length && (
          <Badge variant="secondary" className="text-[10px] shrink-0">
            {(length / 1000).toFixed(1)}k chars
          </Badge>
        )}
        {expanded ? (
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        )}
      </button>
      {expanded && (
        <div className="border-t px-3 py-2">
          <pre className="text-xs whitespace-pre-wrap max-h-60 overflow-auto text-muted-foreground">
            {result.text.slice(0, 3000)}
            {result.text.length > 3000 && "\n\n... (truncated)"}
          </pre>
        </div>
      )}
    </div>
  );
}

// ─── Calculator ─────────────────────────────────────────────────────
function CalculatorResult({
  input,
  result,
}: {
  input: any;
  result: { success: boolean; text: string; data?: any };
}) {
  const expression = input?.expression || "";
  const value = result.data?.result;

  return (
    <div className="my-2 rounded-lg border bg-muted/20 p-3">
      <div className="flex items-center gap-2">
        <Calculator className="h-3.5 w-3.5 text-muted-foreground" />
        <code className="text-xs text-muted-foreground">{expression}</code>
        <span className="text-muted-foreground">=</span>
        <span className="text-sm font-mono font-semibold">
          {value !== undefined ? String(value) : result.text}
        </span>
      </div>
    </div>
  );
}

// ─── Memory Store ───────────────────────────────────────────────────
function MemoryStoreResult({
  input,
  result,
}: {
  input: any;
  result: { success: boolean; text: string; data?: any };
}) {
  const action = input?.action;
  const memories = result.data?.results;

  // Remember action — confirmation
  if (action === "remember") {
    return (
      <div className="my-2 rounded-lg border bg-purple-500/5 border-purple-500/20 p-2.5">
        <div className="flex items-center gap-2 text-xs">
          <Brain className="h-3.5 w-3.5 text-purple-500" />
          <CheckCircle2 className="h-3 w-3 text-green-500" />
          <span className="text-muted-foreground">Memory saved</span>
        </div>
      </div>
    );
  }

  // Recall action — list memories with relevance
  if (memories && Array.isArray(memories)) {
    return (
      <div className="my-2 space-y-1.5">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Brain className="h-3 w-3 text-purple-500" />
          <span>{memories.length} memories found</span>
        </div>
        {memories.slice(0, 5).map((m: any, i: number) => (
          <div
            key={i}
            className="rounded-lg border bg-muted/20 p-2.5 text-xs"
          >
            <div className="flex items-center gap-1.5 mb-1">
              <Badge
                variant="secondary"
                className="text-[10px] bg-purple-500/10 text-purple-500"
              >
                {m.type}
              </Badge>
              {m.similarity !== undefined && (
                <span className="text-muted-foreground">
                  {Math.round(m.similarity * 100)}% match
                </span>
              )}
            </div>
            <p className="text-muted-foreground">{m.content}</p>
          </div>
        ))}
      </div>
    );
  }

  return <GenericToolResult toolName="memory_store" input={input} result={result} />;
}

// ─── Code Execute ───────────────────────────────────────────────────
function CodeExecuteResult({
  input,
  result,
}: {
  input: any;
  result: { success: boolean; text: string; data?: any };
}) {
  const [showCode, setShowCode] = useState(false);
  const language = input?.language || "javascript";
  const code = input?.code;

  return (
    <div className="my-2 rounded-lg border bg-muted/20 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b bg-muted/30">
        <Code className="h-3.5 w-3.5 text-muted-foreground" />
        <Badge variant="secondary" className="text-[10px]">
          {language}
        </Badge>
        {!result.success && (
          <Badge
            variant="secondary"
            className="text-[10px] bg-red-500/10 text-red-500"
          >
            error
          </Badge>
        )}
        {code && (
          <button
            className="ml-auto text-[10px] text-muted-foreground hover:text-foreground"
            onClick={() => setShowCode(!showCode)}
          >
            {showCode ? "hide code" : "show code"}
          </button>
        )}
      </div>
      {/* Input code (collapsible) */}
      {showCode && code && (
        <pre className="px-3 py-2 text-xs bg-muted/40 border-b overflow-auto max-h-40 font-mono">
          {code}
        </pre>
      )}
      {/* Output */}
      <pre
        className={cn(
          "px-3 py-2 text-xs overflow-auto max-h-60 font-mono whitespace-pre-wrap",
          !result.success && "text-red-400"
        )}
      >
        {result.text || "(no output)"}
      </pre>
    </div>
  );
}

// ─── Self Modify ────────────────────────────────────────────────────
function SelfModifyResult({
  input,
  result,
}: {
  input: any;
  result: { success: boolean; text: string; data?: any };
}) {
  const action = input?.action;
  const [expanded, setExpanded] = useState(action === "read_file");

  // File read — show as code block
  if (action === "read_file") {
    const filePath = input?.file_path || result.data?.path || "";
    const ext = filePath.split(".").pop() || "";

    return (
      <div className="my-2 rounded-lg border bg-muted/20 overflow-hidden">
        <button
          className="flex w-full items-center gap-2 px-3 py-1.5 border-b bg-muted/30 hover:bg-muted/50 transition-colors text-left"
          onClick={() => setExpanded(!expanded)}
        >
          <FileText className="h-3.5 w-3.5 text-muted-foreground" />
          <code className="text-xs text-muted-foreground flex-1 truncate">
            {filePath}
          </code>
          {result.data?.size && (
            <Badge variant="secondary" className="text-[10px] shrink-0">
              {(result.data.size / 1024).toFixed(1)}KB
            </Badge>
          )}
          {expanded ? (
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          )}
        </button>
        {expanded && (
          <pre className="px-3 py-2 text-xs overflow-auto max-h-80 font-mono whitespace-pre-wrap">
            {result.text}
          </pre>
        )}
      </div>
    );
  }

  // Command — terminal style
  if (action === "run_command") {
    return (
      <div className="my-2 rounded-lg border bg-zinc-950 overflow-hidden">
        <div className="flex items-center gap-2 px-3 py-1.5 border-b border-zinc-800">
          <Terminal className="h-3.5 w-3.5 text-zinc-400" />
          <code className="text-xs text-zinc-400 truncate">
            {input?.command}
          </code>
        </div>
        <pre className="px-3 py-2 text-xs text-green-400 font-mono overflow-auto max-h-60 whitespace-pre-wrap">
          {result.text || "(no output)"}
        </pre>
      </div>
    );
  }

  // Write/edit — confirmation
  return (
    <div className="my-2 rounded-lg border bg-muted/20 p-2.5">
      <div className="flex items-center gap-2 text-xs">
        <Terminal className="h-3.5 w-3.5 text-muted-foreground" />
        <Badge variant="secondary" className="text-[10px]">
          {action || "self_modify"}
        </Badge>
        {result.success ? (
          <CheckCircle2 className="h-3 w-3 text-green-500" />
        ) : (
          <XCircle className="h-3 w-3 text-red-500" />
        )}
        <span className="text-muted-foreground truncate flex-1">
          {result.text.slice(0, 100)}
        </span>
      </div>
    </div>
  );
}

// ─── Task Manage ────────────────────────────────────────────────────
function TaskManageResult({
  input,
  result,
}: {
  input: any;
  result: { success: boolean; text: string; data?: any };
}) {
  const action = input?.action;

  // Create — confirmation card
  if (action === "create") {
    return (
      <div className="my-2 rounded-lg border bg-muted/20 p-2.5">
        <div className="flex items-center gap-2 text-xs">
          <ListTodo className="h-3.5 w-3.5 text-muted-foreground" />
          <CheckCircle2 className="h-3 w-3 text-green-500" />
          <span className="font-medium">Task created</span>
        </div>
        {result.data?.nextRunAt && (
          <p className="mt-1 text-xs text-muted-foreground">
            Next run: {new Date(result.data.nextRunAt).toLocaleString()}
          </p>
        )}
      </div>
    );
  }

  return <GenericToolResult toolName="task_manage" input={input} result={result} />;
}

// ─── Crypto Trade ──────────────────────────────────────────────────
function CryptoTradeResult({
  input,
  result,
}: {
  input: any;
  result: { success: boolean; text: string; data?: any };
}) {
  const action = input?.action;
  const data = result.data;

  // ── Get Price ──────────────────────────────────────────────────
  if (action === "get_price" && data) {
    const change = data.change24h || 0;
    const isPositive = change >= 0;
    const ChangeIcon = isPositive ? TrendingUp : TrendingDown;

    return (
      <div className="my-2 rounded-lg border bg-muted/20 p-3">
        <div className="flex items-center gap-2 mb-1.5">
          <TrendingUp className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-sm font-medium">{data.symbol}</span>
        </div>
        <div className="flex items-baseline gap-2 mb-1">
          <span className="text-xl font-mono font-bold">
            ${data.price?.toLocaleString()}
          </span>
          <div
            className={cn(
              "flex items-center gap-0.5 text-xs font-medium",
              isPositive ? "text-green-500" : "text-red-500"
            )}
          >
            <ChangeIcon className="h-3 w-3" />
            <span>
              {isPositive ? "+" : ""}
              {change.toFixed(2)}%
            </span>
          </div>
        </div>
        <div className="flex gap-4 text-xs text-muted-foreground">
          <span>
            High: <span className="font-mono">${data.high24h?.toLocaleString()}</span>
          </span>
          <span>
            Low: <span className="font-mono">${data.low24h?.toLocaleString()}</span>
          </span>
          {data.volume && (
            <span>
              Vol: <span className="font-mono">{Number(data.volume).toLocaleString()}</span>
            </span>
          )}
        </div>
      </div>
    );
  }

  // ── Get Portfolio ──────────────────────────────────────────────
  if (action === "get_portfolio" && data?.holdings) {
    if (data.holdings.length === 0) {
      return (
        <div className="my-2 rounded-lg border bg-muted/20 p-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <DollarSign className="h-3.5 w-3.5" />
            <span>Portfolio is empty</span>
          </div>
        </div>
      );
    }

    return (
      <div className="my-2 space-y-1.5">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <DollarSign className="h-3 w-3" />
          <span>{data.holdings.length} holdings</span>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          {data.holdings.map((h: any, i: number) => (
            <div
              key={i}
              className="rounded-lg border bg-muted/20 p-2.5"
            >
              <div className="text-sm font-medium">{h.currency}</div>
              <div className="text-xs font-mono text-muted-foreground">
                {Number(h.amount).toLocaleString()}{" "}
                {h.free !== undefined && h.free !== h.amount && (
                  <span className="text-muted-foreground/60">
                    (free: {Number(h.free).toLocaleString()})
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ── Place Order (Preview) ─────────────────────────────────────
  if (action === "place_order" && data?.preview) {
    return (
      <div className="my-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
        <div className="flex items-center gap-2 mb-2">
          <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
          <span className="text-xs font-medium text-amber-600 dark:text-amber-400">
            ORDER PREVIEW — not yet executed
          </span>
        </div>
        <div className="space-y-1 text-sm">
          <div className="flex items-center gap-2">
            <Badge
              variant="secondary"
              className={cn(
                "text-[10px]",
                data.side === "buy"
                  ? "bg-green-500/10 text-green-500"
                  : "bg-red-500/10 text-red-500"
              )}
            >
              {data.side?.toUpperCase()}
            </Badge>
            <span className="font-mono font-medium">
              {data.amount} {data.symbol}
            </span>
            <Badge variant="secondary" className="text-[10px]">
              {data.type}
            </Badge>
          </div>
          <div className="text-xs text-muted-foreground space-y-0.5">
            <p>
              Est. price: <span className="font-mono">${data.estimatedPrice?.toLocaleString()}</span>
            </p>
            <p>
              Est. value:{" "}
              <span className="font-mono font-medium">
                ~${data.estimatedValue?.toFixed(2)}
              </span>
            </p>
            {data.limitPrice && (
              <p>
                Limit: <span className="font-mono">${data.limitPrice?.toLocaleString()}</span>
              </p>
            )}
            <p>
              Sandbox:{" "}
              <span
                className={cn(
                  "font-medium",
                  data.sandbox ? "text-blue-500" : "text-amber-500"
                )}
              >
                {data.sandbox ? "YES (testnet)" : "NO (real money)"}
              </span>
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ── Place Order (Executed) ────────────────────────────────────
  if (action === "place_order" && data?.orderId) {
    return (
      <div className="my-2 rounded-lg border border-green-500/30 bg-green-500/5 p-3">
        <div className="flex items-center gap-2 mb-2">
          <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
          <span className="text-xs font-medium text-green-600 dark:text-green-400">
            Order placed
          </span>
          {data.sandbox && (
            <Badge
              variant="secondary"
              className="text-[10px] bg-blue-500/10 text-blue-500"
            >
              SANDBOX
            </Badge>
          )}
        </div>
        <div className="space-y-1 text-sm">
          <div className="flex items-center gap-2">
            <Badge
              variant="secondary"
              className={cn(
                "text-[10px]",
                data.side === "buy"
                  ? "bg-green-500/10 text-green-500"
                  : "bg-red-500/10 text-red-500"
              )}
            >
              {data.side?.toUpperCase()}
            </Badge>
            <span className="font-mono font-medium">
              {data.amount} {data.symbol}
            </span>
            <Badge variant="secondary" className="text-[10px]">
              {data.status}
            </Badge>
          </div>
          <div className="text-xs text-muted-foreground space-y-0.5">
            <p>
              Order ID:{" "}
              <code className="bg-muted px-1 rounded text-[10px]">
                {data.orderId}
              </code>
            </p>
            {data.price && (
              <p>
                Price: <span className="font-mono">${data.price?.toLocaleString()}</span>
              </p>
            )}
            {data.filled !== undefined && (
              <p>
                Filled: <span className="font-mono">{data.filled} / {data.amount}</span>
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Price History ──────────────────────────────────────────────
  if (action === "get_price_history" && data?.candles && data.candles.length > 0) {
    return (
      <div className="my-2 rounded-lg border bg-muted/20 overflow-hidden">
        <div className="flex items-center gap-2 px-3 py-1.5 border-b bg-muted/30">
          <TrendingUp className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs font-medium">
            {data.symbol} {data.timeframe}
          </span>
          <Badge variant="secondary" className="text-[10px]">
            {data.candles.length} candles
          </Badge>
        </div>
        <div className="overflow-auto max-h-60">
          <table className="w-full text-xs font-mono">
            <thead>
              <tr className="border-b bg-muted/20 text-muted-foreground">
                <th className="px-2 py-1 text-left">Time</th>
                <th className="px-2 py-1 text-right">Open</th>
                <th className="px-2 py-1 text-right">High</th>
                <th className="px-2 py-1 text-right">Low</th>
                <th className="px-2 py-1 text-right">Close</th>
                <th className="px-2 py-1 text-right">Vol</th>
              </tr>
            </thead>
            <tbody>
              {data.candles.slice(-20).map((c: any, i: number) => (
                <tr key={i} className="border-b border-muted/20">
                  <td className="px-2 py-0.5 text-muted-foreground whitespace-nowrap">
                    {new Date(c.timestamp).toLocaleString(undefined, {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </td>
                  <td className="px-2 py-0.5 text-right">{c.open}</td>
                  <td className="px-2 py-0.5 text-right text-green-500">
                    {c.high}
                  </td>
                  <td className="px-2 py-0.5 text-right text-red-500">
                    {c.low}
                  </td>
                  <td className="px-2 py-0.5 text-right font-medium">
                    {c.close}
                  </td>
                  <td className="px-2 py-0.5 text-right text-muted-foreground">
                    {Number(c.volume).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // ── Fallback for other actions ────────────────────────────────
  return (
    <GenericToolResult toolName="crypto_trade" input={input} result={result} />
  );
}

// ─── Generic Fallback ───────────────────────────────────────────────
function GenericToolResult({
  toolName,
  input,
  result,
}: {
  toolName: string;
  input?: any;
  result: { success: boolean; text: string; data?: any };
}) {
  const [expanded, setExpanded] = useState(false);
  const Icon = getToolIcon(toolName);

  return (
    <div className="my-2 rounded-lg border bg-muted/30 text-sm">
      <button
        className="flex w-full items-center gap-2 p-2 text-left hover:bg-muted/50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <Badge variant="secondary" className="text-xs font-mono">
          {toolName}
        </Badge>
        <span className="flex-1 truncate text-xs text-muted-foreground">
          {result.text.slice(0, 80)}
        </span>
        {result.success ? (
          <CheckCircle2 className="h-3 w-3 text-green-500 shrink-0" />
        ) : (
          <XCircle className="h-3 w-3 text-red-500 shrink-0" />
        )}
        {expanded ? (
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        )}
      </button>
      {expanded && (
        <div className="border-t px-3 py-2 space-y-2">
          {input && (
            <div>
              <div className="text-xs font-medium text-muted-foreground mb-1">
                Input
              </div>
              <pre className="text-xs bg-muted rounded p-2 overflow-auto max-h-40">
                {JSON.stringify(input, null, 2)}
              </pre>
            </div>
          )}
          <div>
            <div className="text-xs font-medium text-muted-foreground mb-1">
              Output
            </div>
            <pre className="text-xs bg-muted rounded p-2 overflow-auto max-h-40 whitespace-pre-wrap">
              {result.text}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
