"use client";

import { useRouter } from "next/navigation";
import { Bot, MessageSquare, Plus, Sparkles, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { PageTransition } from "@/components/layout/page-transition";

export default function ChatPage() {
  const router = useRouter();
  const createConversation = trpc.conversations.create.useMutation({
    onSuccess: (data) => {
      router.push(`/chat/${data.id}`);
    },
  });

  return (
    <PageTransition>
    <div className="flex h-full flex-col items-center justify-center p-8">
      <div className="flex flex-col items-center gap-6 max-w-md text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
          <Bot className="h-8 w-8 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Welcome to Richy</h1>
          <p className="mt-2 text-muted-foreground">
            Your personal AI agent. Start a conversation to get help with
            anything.
          </p>
        </div>

        <div className="grid w-full gap-3">
          <Button
            size="lg"
            className="gap-2"
            onClick={() => createConversation.mutate()}
          >
            <Plus className="h-4 w-4" />
            Start a new chat
          </Button>
        </div>

        <div className="grid grid-cols-1 gap-3 w-full text-left sm:grid-cols-3">
          <div className="rounded-lg border p-3">
            <MessageSquare className="h-5 w-5 text-primary mb-2" />
            <div className="text-sm font-medium">Chat</div>
            <div className="text-xs text-muted-foreground">
              Have natural conversations
            </div>
          </div>
          <div className="rounded-lg border p-3">
            <Wrench className="h-5 w-5 text-primary mb-2" />
            <div className="text-sm font-medium">Tools</div>
            <div className="text-xs text-muted-foreground">
              Browse web, run code, manage files
            </div>
          </div>
          <div className="rounded-lg border p-3">
            <Sparkles className="h-5 w-5 text-primary mb-2" />
            <div className="text-sm font-medium">Memory</div>
            <div className="text-xs text-muted-foreground">
              Remembers your preferences
            </div>
          </div>
        </div>
      </div>
    </div>
    </PageTransition>
  );
}
