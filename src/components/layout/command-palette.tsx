"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  MessageSquare,
  Brain,
  Settings,
  Wrench,
  Plus,
  Search,
  Sun,
  Moon,
} from "lucide-react";
import { useTheme } from "next-themes";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { trpc } from "@/lib/trpc";
import { nanoid } from "nanoid";

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const { setTheme, theme } = useTheme();

  const { data: conversations } = trpc.conversations.list.useQuery(
    { limit: 5 },
    { enabled: open }
  );

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  const runCommand = (fn: () => void) => {
    setOpen(false);
    fn();
  };

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Type a command or search..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>

        <CommandGroup heading="Actions">
          <CommandItem
            onSelect={() =>
              runCommand(() => {
                const id = nanoid();
                router.push(`/chat/${id}`);
              })
            }
          >
            <Plus className="mr-2 h-4 w-4" />
            New Chat
          </CommandItem>
          <CommandItem
            onSelect={() => runCommand(() => router.push("/chat"))}
          >
            <MessageSquare className="mr-2 h-4 w-4" />
            Chat Home
          </CommandItem>
          <CommandItem
            onSelect={() => runCommand(() => router.push("/memory"))}
          >
            <Brain className="mr-2 h-4 w-4" />
            Memory Browser
          </CommandItem>
          <CommandItem
            onSelect={() => runCommand(() => router.push("/tools"))}
          >
            <Wrench className="mr-2 h-4 w-4" />
            Tools
          </CommandItem>
          <CommandItem
            onSelect={() => runCommand(() => router.push("/settings"))}
          >
            <Settings className="mr-2 h-4 w-4" />
            Settings
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Theme">
          <CommandItem
            onSelect={() => runCommand(() => setTheme("light"))}
          >
            <Sun className="mr-2 h-4 w-4" />
            Light Mode
          </CommandItem>
          <CommandItem
            onSelect={() => runCommand(() => setTheme("dark"))}
          >
            <Moon className="mr-2 h-4 w-4" />
            Dark Mode
          </CommandItem>
        </CommandGroup>

        {conversations && conversations.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Recent Conversations">
              {conversations.map((conv: any) => (
                <CommandItem
                  key={conv.id}
                  onSelect={() =>
                    runCommand(() => router.push(`/chat/${conv.id}`))
                  }
                >
                  <MessageSquare className="mr-2 h-4 w-4" />
                  {conv.title}
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}
