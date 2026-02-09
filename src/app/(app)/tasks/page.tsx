"use client";

import { useState } from "react";
import {
  ListTodo,
  Plus,
  Trash2,
  Play,
  Pause,
  Clock,
  CheckCircle2,
  XCircle,
  CalendarClock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { formatDistanceToNow } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";

const statusConfig: Record<
  string,
  { icon: React.ElementType; color: string; label: string }
> = {
  active: {
    icon: Play,
    color: "bg-green-500/10 text-green-500",
    label: "Active",
  },
  paused: {
    icon: Pause,
    color: "bg-yellow-500/10 text-yellow-500",
    label: "Paused",
  },
  completed: {
    icon: CheckCircle2,
    color: "bg-blue-500/10 text-blue-500",
    label: "Completed",
  },
  failed: {
    icon: XCircle,
    color: "bg-red-500/10 text-red-500",
    label: "Failed",
  },
};

export default function TasksPage() {
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newTask, setNewTask] = useState({
    name: "",
    description: "",
    type: "once" as "once" | "cron",
    schedule: "",
    prompt: "",
    nextRunAt: "",
  });

  const { data: tasks, refetch } = trpc.tasks.list.useQuery(
    filterStatus === "all" ? {} : { status: filterStatus as any }
  );

  const createTask = trpc.tasks.create.useMutation({
    onSuccess: () => {
      refetch();
      setDialogOpen(false);
      setNewTask({
        name: "",
        description: "",
        type: "once",
        schedule: "",
        prompt: "",
        nextRunAt: "",
      });
    },
  });

  const updateTask = trpc.tasks.update.useMutation({
    onSuccess: () => refetch(),
  });

  const deleteTask = trpc.tasks.delete.useMutation({
    onSuccess: () => refetch(),
  });

  const handleCreate = () => {
    if (!newTask.name.trim() || !newTask.prompt.trim()) return;
    createTask.mutate({
      name: newTask.name,
      description: newTask.description || undefined,
      type: newTask.type,
      schedule: newTask.type === "cron" ? newTask.schedule : undefined,
      action: JSON.stringify({
        type: "agent_prompt",
        prompt: newTask.prompt,
        notify: true,
      }),
      nextRunAt: newTask.nextRunAt || undefined,
    });
  };

  const toggleStatus = (id: string, currentStatus: string) => {
    const next = currentStatus === "active" ? "paused" : "active";
    updateTask.mutate({ id, status: next });
  };

  const activeCount = tasks?.filter((t) => t.status === "active").length ?? 0;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="border-b p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ListTodo className="h-5 w-5" />
            <h1 className="text-lg font-semibold">Tasks</h1>
            {tasks && (
              <Badge variant="secondary">
                {activeCount} active / {tasks.length} total
              </Badge>
            )}
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1">
                <Plus className="h-3.5 w-3.5" />
                New Task
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Task</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Name</Label>
                  <Input
                    placeholder="Daily news summary"
                    value={newTask.name}
                    onChange={(e) =>
                      setNewTask((p) => ({ ...p, name: e.target.value }))
                    }
                  />
                </div>
                <div>
                  <Label>Description (optional)</Label>
                  <Input
                    placeholder="Brief description of what this task does"
                    value={newTask.description}
                    onChange={(e) =>
                      setNewTask((p) => ({
                        ...p,
                        description: e.target.value,
                      }))
                    }
                  />
                </div>
                <div>
                  <Label>Type</Label>
                  <Select
                    value={newTask.type}
                    onValueChange={(v) =>
                      setNewTask((p) => ({
                        ...p,
                        type: v as "once" | "cron",
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="once">Run Once</SelectItem>
                      <SelectItem value="cron">Recurring (Cron)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {newTask.type === "cron" && (
                  <div>
                    <Label>Cron Schedule</Label>
                    <Input
                      placeholder="0 9 * * * (daily at 9am)"
                      value={newTask.schedule}
                      onChange={(e) =>
                        setNewTask((p) => ({
                          ...p,
                          schedule: e.target.value,
                        }))
                      }
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Standard cron syntax: minute hour day month weekday
                    </p>
                  </div>
                )}
                <div>
                  <Label>
                    {newTask.type === "once"
                      ? "Run At (optional)"
                      : "First Run At (optional)"}
                  </Label>
                  <Input
                    type="datetime-local"
                    value={newTask.nextRunAt}
                    onChange={(e) =>
                      setNewTask((p) => ({
                        ...p,
                        nextRunAt: e.target.value,
                      }))
                    }
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Leave empty to run on next scheduler tick (~60s)
                  </p>
                </div>
                <div>
                  <Label>Prompt</Label>
                  <Textarea
                    placeholder="What should Richy do when this task runs?"
                    value={newTask.prompt}
                    onChange={(e) =>
                      setNewTask((p) => ({ ...p, prompt: e.target.value }))
                    }
                    rows={4}
                  />
                </div>
                <Button
                  className="w-full"
                  onClick={handleCreate}
                  disabled={
                    !newTask.name.trim() ||
                    !newTask.prompt.trim() ||
                    createTask.isPending
                  }
                >
                  Create Task
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <div className="mt-3">
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-[160px] h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="paused">Paused</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4">
        {!tasks || tasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground">
            <ListTodo className="h-12 w-12 mb-4 opacity-20" />
            <p>No tasks yet</p>
            <p className="text-sm">
              Create a task to have Richy run it on a schedule
            </p>
          </div>
        ) : (
          <div className="grid gap-3">
            {tasks.map((task) => {
              const cfg = statusConfig[task.status ?? "active"];
              const StatusIcon = cfg?.icon ?? Clock;
              let action: any = null;
              try {
                action = JSON.parse(task.action);
              } catch {}

              return (
                <Card key={task.id} className="group">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-medium text-sm truncate">
                            {task.name}
                          </h3>
                          <Badge
                            variant="secondary"
                            className={cfg?.color ?? ""}
                          >
                            <StatusIcon className="h-3 w-3 mr-1" />
                            {cfg?.label ?? task.status}
                          </Badge>
                          <Badge variant="outline" className="text-xs">
                            {task.type === "cron" ? (
                              <>
                                <CalendarClock className="h-3 w-3 mr-1" />
                                {task.schedule}
                              </>
                            ) : (
                              "One-time"
                            )}
                          </Badge>
                        </div>
                        {task.description && (
                          <p className="text-sm text-muted-foreground mt-1">
                            {task.description}
                          </p>
                        )}
                        {action?.prompt && (
                          <p className="text-xs text-muted-foreground mt-1.5 line-clamp-2 font-mono bg-muted/50 rounded px-2 py-1">
                            {action.prompt}
                          </p>
                        )}
                        <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                          {task.nextRunAt && (
                            <span>
                              Next:{" "}
                              {formatDistanceToNow(new Date(task.nextRunAt), {
                                addSuffix: true,
                              })}
                            </span>
                          )}
                          {task.lastRunAt && (
                            <span>
                              Last:{" "}
                              {formatDistanceToNow(new Date(task.lastRunAt), {
                                addSuffix: true,
                              })}
                            </span>
                          )}
                          {task.createdAt && (
                            <span>
                              Created:{" "}
                              {formatDistanceToNow(new Date(task.createdAt), {
                                addSuffix: true,
                              })}
                            </span>
                          )}
                        </div>
                        {task.result && (
                          <details className="mt-2">
                            <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
                              Last result
                            </summary>
                            <p className="text-xs mt-1 whitespace-pre-wrap bg-muted/50 rounded p-2 max-h-32 overflow-auto">
                              {task.result}
                            </p>
                          </details>
                        )}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {(task.status === "active" ||
                          task.status === "paused") && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            title={
                              task.status === "active" ? "Pause" : "Resume"
                            }
                            onClick={() =>
                              toggleStatus(task.id, task.status ?? "active")
                            }
                          >
                            {task.status === "active" ? (
                              <Pause className="h-3.5 w-3.5" />
                            ) : (
                              <Play className="h-3.5 w-3.5" />
                            )}
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 opacity-0 group-hover:opacity-100"
                          onClick={() => deleteTask.mutate({ id: task.id })}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
