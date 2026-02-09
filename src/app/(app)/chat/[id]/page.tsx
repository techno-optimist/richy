"use client";

import { useParams } from "next/navigation";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useEffect, useRef, useState, useMemo, useCallback, memo } from "react";
import {
  Send,
  Square,
  Bot,
  User,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ToolResultRenderer } from "@/components/chat/tool-result-renderer";

// ─── Stable refs (module-level to prevent re-renders) ────────────────

const markdownComponents = {
  pre: ({ children }: any) => (
    <pre className="bg-muted rounded-lg p-3 overflow-auto text-xs">
      {children}
    </pre>
  ),
  code: ({ className, children, ...props }: any) => {
    const isInline = !className;
    if (isInline) {
      return (
        <code
          className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono"
          {...props}
        >
          {children}
        </code>
      );
    }
    return (
      <code className={cn("text-xs font-mono", className)} {...props}>
        {children}
      </code>
    );
  },
};

const remarkPlugins = [remarkGfm];

// ─── Memo'd markdown (expensive to re-parse) ────────────────────────

const MessageContent = memo(function MessageContent({
  content,
}: {
  content: string;
}) {
  return (
    <div className="prose prose-sm dark:prose-invert max-w-none break-words">
      <ReactMarkdown
        remarkPlugins={remarkPlugins}
        components={markdownComponents}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
});

// ─── Tool part extraction (handles all v6 formats) ──────────────────

function getToolPartInfo(part: any): {
  toolName: string;
  input: any;
  output: any;
  state: string;
  errorText?: string;
} | null {
  // Our normalized storage format
  if (part.type === "tool-invocation") {
    return {
      toolName: part.toolName,
      input: part.input,
      output: part.output,
      state: part.state || "output-available",
      errorText: part.errorText,
    };
  }
  // v6 dynamic tool
  if (part.type === "dynamic-tool") {
    return {
      toolName: part.toolName,
      input: part.input,
      output: part.output,
      state: part.state || "output-available",
      errorText: part.errorText,
    };
  }
  // v6 static tool: "tool-calculator", "tool-web_search", etc.
  if (
    typeof part.type === "string" &&
    part.type.startsWith("tool-") &&
    part.type !== "tool-invocation"
  ) {
    return {
      toolName: part.type.slice(5),
      input: part.input,
      output: part.output,
      state: part.state || "output-available",
      errorText: part.errorText,
    };
  }
  return null;
}

// ─── Message bubble ─────────────────────────────────────────────────

function ChatMessage({ message }: { message: any }) {
  const isUser = message.role === "user";

  return (
    <div className={cn("flex gap-3", isUser ? "justify-end" : "justify-start")}>
      {!isUser && (
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 mt-0.5">
          <Bot className="h-4 w-4 text-primary" />
        </div>
      )}

      <div
        className={cn(
          "max-w-[85%] rounded-2xl px-4 py-2.5",
          isUser ? "bg-primary text-primary-foreground" : "bg-muted"
        )}
      >
        {message.parts?.map((part: any, i: number) => {
          if (part.type === "text" && part.text) {
            return <MessageContent key={`text-${i}`} content={part.text} />;
          }

          const toolInfo = getToolPartInfo(part);
          if (toolInfo) {
            return (
              <ToolResultRenderer
                key={`tool-${part.toolCallId || i}`}
                toolName={toolInfo.toolName}
                input={toolInfo.input}
                output={toolInfo.output}
                state={toolInfo.state}
                errorText={toolInfo.errorText}
              />
            );
          }

          return null;
        })}

        {/* Fallback for messages without parts */}
        {(!message.parts || message.parts.length === 0) &&
          message.content && (
            <MessageContent content={message.content} />
          )}
      </div>

      {isUser && (
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-secondary mt-0.5">
          <User className="h-4 w-4" />
        </div>
      )}
    </div>
  );
}

// ─── Scroll helper ──────────────────────────────────────────────────

function isNearBottom(el: HTMLElement, threshold = 150): boolean {
  return el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
}

// ─── Main page ──────────────────────────────────────────────────────

export default function ChatConversationPage() {
  const params = useParams();
  const conversationId = params.id as string;
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [input, setInput] = useState("");

  // tRPC: load past messages
  const { data: dbMessages, refetch: refetchMessages } =
    trpc.messages.listByConversation.useQuery({
      conversationId,
      limit: 100,
    });

  // Transport for useChat
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        body: { conversationId },
        headers: {
          "x-auth-token":
            typeof window !== "undefined"
              ? localStorage.getItem("richy_auth_token") || ""
              : "",
        },
      }),
    [conversationId]
  );

  // useChat — capture error + onError
  const { messages, sendMessage, setMessages, status, stop, error } = useChat({
    id: conversationId,
    transport,
    onError: (err) => {
      console.error("[Richy:Chat] Stream error:", err);
    },
  });

  const isStreaming = status === "streaming";
  const isSubmitted = status === "submitted";
  const isError = status === "error";
  const isBusy = isStreaming || isSubmitted;

  // ── Scroll ──────────────────────────────────────────────────────────

  const scrollToBottom = useCallback((force = false) => {
    const el = scrollRef.current;
    if (!el) return;
    if (force || isNearBottom(el)) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, []);

  // Auto-scroll during streaming
  useEffect(() => {
    if (!isStreaming) return;
    const id = setInterval(() => scrollToBottom(), 300);
    return () => clearInterval(id);
  }, [isStreaming, scrollToBottom]);

  // Scroll on message count changes
  useEffect(() => {
    scrollToBottom();
  }, [messages.length, scrollToBottom]);

  // ── Load DB messages into useChat ───────────────────────────────────

  const loadedConvRef = useRef<string | null>(null);

  useEffect(() => {
    // Only load once per conversation, never during active streaming
    if (loadedConvRef.current === conversationId) return;
    if (!dbMessages || dbMessages.length === 0) return;
    if (isBusy) return;

    loadedConvRef.current = conversationId;

    const loaded = dbMessages
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => {
        let parts: any[];
        if (m.parts) {
          try {
            parts = JSON.parse(m.parts);
          } catch {
            parts = [{ type: "text" as const, text: m.content || "" }];
          }
        } else {
          parts = [{ type: "text" as const, text: m.content || "" }];
        }
        return {
          id: m.id,
          role: m.role as "user" | "assistant",
          parts,
          createdAt: m.createdAt ? new Date(m.createdAt) : new Date(),
        };
      });

    if (loaded.length > 0) {
      setMessages(loaded);
      requestAnimationFrame(() => scrollToBottom(true));
    }
  }, [conversationId, dbMessages, isBusy, setMessages, scrollToBottom]);

  // Reset load guard when conversation changes
  useEffect(() => {
    return () => {
      // On unmount or conversation change, allow re-loading
      loadedConvRef.current = null;
    };
  }, [conversationId]);

  // ── Refetch DB messages after streaming completes ───────────────────

  const prevStatusRef = useRef(status);
  useEffect(() => {
    const prev = prevStatusRef.current;
    prevStatusRef.current = status;

    // Stream finished (either success or error) → refetch to persist
    if ((prev === "streaming" || prev === "submitted") && (status === "ready" || status === "error")) {
      const timer = setTimeout(() => refetchMessages(), 1000);
      return () => clearTimeout(timer);
    }
  }, [status, refetchMessages]);

  // ── Send message ───────────────────────────────────────────────────

  const handleSend = () => {
    const text = input.trim();
    if (!text || isBusy) return;
    setInput("");
    sendMessage({ text });
    requestAnimationFrame(() => scrollToBottom(true));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // ── Determine if we need a "Thinking" indicator ────────────────────
  // Show it during "submitted" AND during early "streaming" when no
  // visible content has appeared yet (e.g. tool execution phase).

  const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
  const hasVisibleContent = lastAssistant?.parts?.some(
    (p: any) => (p.type === "text" && p.text) || getToolPartInfo(p)
  );
  const showThinking = isSubmitted || (isStreaming && !hasVisibleContent);

  // ── Render ─────────────────────────────────────────────────────────

  return (
    <div className="flex h-full flex-col">
      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-4 py-6 space-y-6 pb-4">
          {messages.length === 0 && !isBusy && (
            <div className="flex flex-col items-center justify-center py-20 text-center text-muted-foreground">
              <Bot className="h-10 w-10 mb-3 opacity-30" />
              <p className="text-sm">
                Send a message to start the conversation
              </p>
            </div>
          )}

          {messages.map((message) => (
            <ChatMessage key={message.id} message={message} />
          ))}

          {/* Thinking indicator */}
          {showThinking && (
            <div className="flex gap-3">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 mt-0.5">
                <Bot className="h-4 w-4 text-primary" />
              </div>
              <div className="rounded-2xl bg-muted px-4 py-3">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Thinking...
                </div>
              </div>
            </div>
          )}

          {/* Error display */}
          {isError && error && (
            <div className="flex gap-3">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-destructive/10 mt-0.5">
                <AlertCircle className="h-4 w-4 text-destructive" />
              </div>
              <div className="rounded-2xl bg-destructive/10 px-4 py-3 max-w-[85%]">
                <p className="text-sm font-medium text-destructive">
                  Failed to get response
                </p>
                <p className="text-xs text-destructive/70 mt-1">
                  {error.message || "An unknown error occurred"}
                </p>
                <p className="text-xs text-muted-foreground mt-2">
                  Try sending your message again.
                </p>
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </div>

      {/* Input */}
      <div className="border-t bg-background p-3 pb-safe">
        <div className="mx-auto flex max-w-3xl items-end gap-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Message Richy..."
            className="min-h-[44px] max-h-[200px] resize-none rounded-xl"
            rows={1}
          />
          {isStreaming ? (
            <Button
              type="button"
              size="icon"
              variant="outline"
              className="h-[44px] w-[44px] shrink-0 rounded-xl"
              onClick={() => stop()}
            >
              <Square className="h-4 w-4" />
            </Button>
          ) : (
            <Button
              type="button"
              size="icon"
              className="h-[44px] w-[44px] shrink-0 rounded-xl"
              disabled={!input.trim() || isBusy}
              onClick={handleSend}
            >
              <Send className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
