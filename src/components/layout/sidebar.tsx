"use client";

import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import {
  MessageSquare,
  Brain,
  ListTodo,
  Wrench,
  Activity,
  Settings,
  Plus,
  Search,
  PanelLeftClose,
  PanelLeft,
  Bot,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { useUIStore } from "@/stores/ui-store";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { formatDistanceToNow } from "date-fns";

const navItems = [
  { href: "/chat", icon: MessageSquare, label: "Chat" },
  { href: "/memory", icon: Brain, label: "Memory" },
  { href: "/tasks", icon: ListTodo, label: "Tasks" },
  { href: "/tools", icon: Wrench, label: "Tools" },
  { href: "/sentinel", icon: Activity, label: "Sentinel" },
  { href: "/settings", icon: Settings, label: "Settings" },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { sidebarCollapsed, setSidebarCollapsed } = useUIStore();
  const [searchQuery, setSearchQuery] = useState("");

  const { data: conversations } = trpc.conversations.list.useQuery(
    { limit: 50 },
    { refetchInterval: 10000 }
  );

  const createConversation = trpc.conversations.create.useMutation({
    onSuccess: (data) => {
      router.push(`/chat/${data.id}`);
    },
  });

  const deleteConversation = trpc.conversations.delete.useMutation();

  const utils = trpc.useUtils();

  const filteredConversations = conversations?.filter((c) =>
    c.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const isActive = (href: string) => pathname.startsWith(href);

  return (
    <div
      className={cn(
        "flex h-full flex-col border-r bg-sidebar text-sidebar-foreground transition-all duration-200",
        sidebarCollapsed ? "w-16" : "w-64"
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-2 p-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Bot className="h-4 w-4" />
        </div>
        {!sidebarCollapsed && (
          <span className="text-lg font-semibold">Richy</span>
        )}
        <Button
          variant="ghost"
          size="icon"
          className={cn("ml-auto h-8 w-8", sidebarCollapsed && "ml-0")}
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
        >
          {sidebarCollapsed ? (
            <PanelLeft className="h-4 w-4" />
          ) : (
            <PanelLeftClose className="h-4 w-4" />
          )}
        </Button>
      </div>

      <Separator />

      {/* New Chat */}
      <div className="p-2">
        <Button
          variant="outline"
          className={cn("w-full justify-start gap-2", sidebarCollapsed && "justify-center px-2")}
          onClick={() => createConversation.mutate()}
        >
          <Plus className="h-4 w-4" />
          {!sidebarCollapsed && "New Chat"}
        </Button>
      </div>

      {/* Search */}
      {!sidebarCollapsed && (
        <div className="px-2 pb-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search chats..."
              className="h-8 pl-8 text-sm"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>
      )}

      {/* Conversation List */}
      <ScrollArea className="flex-1 min-h-0 px-2">
        {!sidebarCollapsed && (
          <div className="space-y-0.5">
            {filteredConversations?.map((conv) => (
              <div
                key={conv.id}
                className={cn(
                  "group flex items-center overflow-hidden rounded-md text-sm transition-colors",
                  isActive(`/chat/${conv.id}`)
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "hover:bg-sidebar-accent/50"
                )}
              >
                <Button
                  variant="ghost"
                  size="icon"
                  className="ml-1 h-6 w-6 shrink-0 opacity-50 hover:opacity-100 hover:text-destructive"
                  onClick={async (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    await deleteConversation.mutateAsync({ id: conv.id });
                    utils.conversations.list.invalidate();
                    if (pathname === `/chat/${conv.id}`) {
                      router.push("/chat");
                    }
                  }}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
                <Link
                  href={`/chat/${conv.id}`}
                  className="flex-1 min-w-0 overflow-hidden px-1.5 py-1.5"
                >
                  <div className="truncate">{conv.title}</div>
                  {conv.updatedAt && (
                    <div className="truncate text-xs text-muted-foreground">
                      {formatDistanceToNow(conv.updatedAt, {
                        addSuffix: true,
                      })}
                    </div>
                  )}
                </Link>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>

      <Separator />

      {/* Navigation */}
      <nav className="p-2">
        <div className="space-y-0.5">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
                sidebarCollapsed && "justify-center px-2",
                isActive(item.href)
                  ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
              )}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              {!sidebarCollapsed && item.label}
            </Link>
          ))}
        </div>
      </nav>
    </div>
  );
}
