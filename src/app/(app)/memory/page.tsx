"use client";

import { useState } from "react";
import { Brain, Search, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { formatDistanceToNow } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const typeColors: Record<string, string> = {
  fact: "bg-blue-500/10 text-blue-500",
  preference: "bg-purple-500/10 text-purple-500",
  pattern: "bg-green-500/10 text-green-500",
  note: "bg-yellow-500/10 text-yellow-500",
  entity: "bg-orange-500/10 text-orange-500",
};

export default function MemoryPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [newMemory, setNewMemory] = useState({
    content: "",
    type: "note" as const,
  });
  const [dialogOpen, setDialogOpen] = useState(false);

  const { data: memories, refetch } = trpc.memory.list.useQuery(
    filterType === "all" ? {} : { type: filterType as any }
  );
  const { data: stats } = trpc.memory.stats.useQuery();
  const createMemory = trpc.memory.create.useMutation({
    onSuccess: () => {
      refetch();
      setDialogOpen(false);
      setNewMemory({ content: "", type: "note" });
    },
  });
  const deleteMemory = trpc.memory.delete.useMutation({
    onSuccess: () => refetch(),
  });

  const filtered = memories?.filter((m) =>
    m.content.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="border-b p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Brain className="h-5 w-5" />
            <h1 className="text-lg font-semibold">Memory</h1>
            {stats && (
              <Badge variant="secondary">{stats.total} memories</Badge>
            )}
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1">
                <Plus className="h-3.5 w-3.5" />
                Add
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Memory</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <Select
                  value={newMemory.type}
                  onValueChange={(v) =>
                    setNewMemory((p) => ({ ...p, type: v as any }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fact">Fact</SelectItem>
                    <SelectItem value="preference">Preference</SelectItem>
                    <SelectItem value="pattern">Pattern</SelectItem>
                    <SelectItem value="note">Note</SelectItem>
                    <SelectItem value="entity">Entity</SelectItem>
                  </SelectContent>
                </Select>
                <Textarea
                  placeholder="What should Richy remember?"
                  value={newMemory.content}
                  onChange={(e) =>
                    setNewMemory((p) => ({ ...p, content: e.target.value }))
                  }
                  rows={4}
                />
                <Button
                  className="w-full"
                  onClick={() => createMemory.mutate(newMemory)}
                  disabled={!newMemory.content.trim()}
                >
                  Save Memory
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <div className="mt-3 flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search memories..."
              className="pl-8 h-9"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="w-[130px] h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              <SelectItem value="fact">Facts</SelectItem>
              <SelectItem value="preference">Preferences</SelectItem>
              <SelectItem value="pattern">Patterns</SelectItem>
              <SelectItem value="note">Notes</SelectItem>
              <SelectItem value="entity">Entities</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4">
        {!filtered || filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground">
            <Brain className="h-12 w-12 mb-4 opacity-20" />
            <p>No memories yet</p>
            <p className="text-sm">Richy will learn about you as you chat</p>
          </div>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((memory) => (
              <Card key={memory.id} className="group">
                <CardContent className="p-3">
                  <div className="flex items-start justify-between gap-2">
                    <Badge
                      variant="secondary"
                      className={typeColors[memory.type] || ""}
                    >
                      {memory.type}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 opacity-0 group-hover:opacity-100"
                      onClick={() => deleteMemory.mutate({ id: memory.id })}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                  <p className="mt-2 text-sm">{memory.content}</p>
                  {memory.createdAt && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      {formatDistanceToNow(memory.createdAt, {
                        addSuffix: true,
                      })}
                    </p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
