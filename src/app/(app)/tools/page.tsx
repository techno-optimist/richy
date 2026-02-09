"use client";

import { Wrench, Trash2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { trpc } from "@/lib/trpc";
import { formatDistanceToNow } from "date-fns";

const categoryColors: Record<string, string> = {
  web: "bg-blue-500/10 text-blue-500",
  code: "bg-green-500/10 text-green-500",
  memory: "bg-purple-500/10 text-purple-500",
  system: "bg-orange-500/10 text-orange-500",
  custom: "bg-pink-500/10 text-pink-500",
  files: "bg-yellow-500/10 text-yellow-500",
};

type Tool = {
  id: string;
  name: string;
  displayName: string;
  description: string;
  category: string;
  type: "builtin" | "custom";
  enabled: boolean;
  createdAt: Date | null;
};

function ToolCard({
  tool,
  onToggle,
  onDelete,
}: {
  tool: Tool;
  onToggle?: (enabled: boolean) => void;
  onDelete?: () => void;
}) {
  return (
    <Card className="group">
      <CardContent className="p-3">
        <div className="flex items-start justify-between gap-2">
          <Badge
            variant="secondary"
            className={categoryColors[tool.category] || ""}
          >
            {tool.category}
          </Badge>
          {tool.type === "custom" && (
            <div className="flex items-center gap-1">
              <Switch
                checked={tool.enabled}
                onCheckedChange={(checked) => onToggle?.(checked)}
                className="scale-75"
              />
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 opacity-0 group-hover:opacity-100"
                onClick={() => onDelete?.()}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          )}
        </div>
        <p className="mt-2 text-sm font-medium">{tool.displayName}</p>
        <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
          {tool.description}
        </p>
        {tool.createdAt && (
          <p className="mt-2 text-xs text-muted-foreground">
            {formatDistanceToNow(tool.createdAt, { addSuffix: true })}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export default function ToolsPage() {
  const { data: tools, refetch } = trpc.tools.list.useQuery();
  const toggleTool = trpc.tools.toggle.useMutation({
    onSuccess: () => refetch(),
  });
  const deleteTool = trpc.tools.delete.useMutation({
    onSuccess: () => refetch(),
  });

  const builtins = tools?.filter((t) => t.type === "builtin") ?? [];
  const custom = tools?.filter((t) => t.type === "custom") ?? [];

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="border-b p-4">
        <div className="flex items-center gap-2">
          <Wrench className="h-5 w-5" />
          <h1 className="text-lg font-semibold">Tools</h1>
          {tools && (
            <Badge variant="secondary">{tools.length} tools</Badge>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4 space-y-6">
        {/* Built-in Tools */}
        <div>
          <h2 className="text-sm font-medium text-muted-foreground mb-3">
            Built-in ({builtins.length})
          </h2>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {builtins.map((tool) => (
              <ToolCard key={tool.id} tool={tool} />
            ))}
          </div>
        </div>

        {/* Custom Tools */}
        {custom.length > 0 && (
          <div>
            <h2 className="text-sm font-medium text-muted-foreground mb-3">
              Custom ({custom.length})
            </h2>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {custom.map((tool) => (
                <ToolCard
                  key={tool.id}
                  tool={tool}
                  onToggle={(enabled) =>
                    toggleTool.mutate({ id: tool.id, enabled })
                  }
                  onDelete={() => deleteTool.mutate({ id: tool.id })}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
