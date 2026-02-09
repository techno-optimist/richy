"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Bot,
  ArrowRight,
  ArrowLeft,
  Check,
  Sparkles,
  Brain,
  Wrench,
  Eye,
  EyeOff,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

const STEPS = ["welcome", "provider", "personality", "complete"] as const;

const presets = [
  {
    id: "friendly",
    label: "Friendly",
    description: "Warm, casual, and encouraging",
    instructions: "Be warm, friendly, and conversational. Use a casual tone.",
  },
  {
    id: "professional",
    label: "Professional",
    description: "Clear, concise, and business-like",
    instructions:
      "Be professional and concise. Focus on accuracy and clarity.",
  },
  {
    id: "technical",
    label: "Technical",
    description: "Detailed, precise, and thorough",
    instructions:
      "Be technically precise. Include details and explain your reasoning.",
  },
  {
    id: "creative",
    label: "Creative",
    description: "Imaginative, expressive, and fun",
    instructions:
      "Be creative and expressive. Think outside the box and have fun.",
  },
];

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [showApiKey, setShowApiKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<
    "success" | "error" | null
  >(null);

  const [config, setConfig] = useState({
    ai_provider: "anthropic",
    ai_model: "claude-sonnet-4-20250514",
    ai_api_key: "",
    buddy_name: "Richy",
    personality: "",
    preset: "friendly",
  });

  const saveBatch = trpc.settings.setBatch.useMutation();

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);

    try {
      const res = await fetch("/api/test-provider", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: config.ai_provider,
          apiKey: config.ai_api_key,
          model: config.ai_model,
        }),
      });
      if (res.ok) {
        setTestResult("success");
      } else {
        setTestResult("error");
      }
    } catch {
      setTestResult("error");
    }
    setTesting(false);
  };

  const handleComplete = async () => {
    const preset = presets.find((p) => p.id === config.preset);
    await saveBatch.mutateAsync({
      settings: {
        ai_provider: config.ai_provider,
        ai_model: config.ai_model,
        ai_api_key: config.ai_api_key,
        buddy_name: config.buddy_name,
        personality: config.personality || preset?.instructions || "",
        max_steps: 10,
        onboarding_complete: true,
      },
    });
    router.push("/chat");
  };

  const currentStep = STEPS[step];
  const canProceed =
    currentStep === "welcome" ||
    currentStep === "complete" ||
    (currentStep === "provider" && config.ai_api_key.length > 0) ||
    currentStep === "personality";

  return (
    <div className="flex min-h-dvh items-center justify-center bg-gradient-to-br from-background via-background to-primary/5 p-4">
      <div className="w-full max-w-lg">
        {/* Progress */}
        <div className="mb-8 flex justify-center gap-2">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className={cn(
                "h-1.5 w-8 rounded-full transition-colors",
                i <= step ? "bg-primary" : "bg-muted"
              )}
            />
          ))}
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
          >
            {/* Step 1: Welcome */}
            {currentStep === "welcome" && (
              <div className="flex flex-col items-center text-center">
                <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-3xl bg-primary/10">
                  <Bot className="h-10 w-10 text-primary" />
                </div>
                <h1 className="text-3xl font-bold">Welcome to Richy</h1>
                <p className="mt-3 text-muted-foreground max-w-sm">
                  Your personal AI agent that remembers, learns, and takes
                  action for you.
                </p>

                <div className="mt-8 grid w-full gap-3">
                  <div className="flex items-center gap-3 rounded-lg border p-3 text-left">
                    <Sparkles className="h-5 w-5 text-primary shrink-0" />
                    <div>
                      <div className="text-sm font-medium">
                        Autonomous Agent
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Uses tools to browse the web, run code, and more
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 rounded-lg border p-3 text-left">
                    <Brain className="h-5 w-5 text-primary shrink-0" />
                    <div>
                      <div className="text-sm font-medium">
                        Persistent Memory
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Remembers your preferences and past conversations
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 rounded-lg border p-3 text-left">
                    <Wrench className="h-5 w-5 text-primary shrink-0" />
                    <div>
                      <div className="text-sm font-medium">Extensible</div>
                      <div className="text-xs text-muted-foreground">
                        Add new capabilities with MCP tools and plugins
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Step 2: Provider */}
            {currentStep === "provider" && (
              <div>
                <h2 className="text-2xl font-bold text-center">
                  Connect your AI
                </h2>
                <p className="mt-2 text-center text-muted-foreground">
                  Choose an AI provider and enter your API key
                </p>

                <div className="mt-6 space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <Card
                      className={cn(
                        "cursor-pointer p-4 text-center transition-colors",
                        config.ai_provider === "anthropic" &&
                          "border-primary bg-primary/5"
                      )}
                      onClick={() =>
                        setConfig((s) => ({
                          ...s,
                          ai_provider: "anthropic",
                          ai_model: "claude-sonnet-4-20250514",
                        }))
                      }
                    >
                      <div className="font-medium">Anthropic</div>
                      <div className="text-xs text-muted-foreground">
                        Claude models
                      </div>
                    </Card>
                    <Card
                      className={cn(
                        "cursor-pointer p-4 text-center transition-colors",
                        config.ai_provider === "openai" &&
                          "border-primary bg-primary/5"
                      )}
                      onClick={() =>
                        setConfig((s) => ({
                          ...s,
                          ai_provider: "openai",
                          ai_model: "gpt-4o",
                        }))
                      }
                    >
                      <div className="font-medium">OpenAI</div>
                      <div className="text-xs text-muted-foreground">
                        GPT models
                      </div>
                    </Card>
                  </div>

                  <div className="space-y-2">
                    <Label>API Key</Label>
                    <div className="relative">
                      <Input
                        type={showApiKey ? "text" : "password"}
                        value={config.ai_api_key}
                        onChange={(e) =>
                          setConfig((s) => ({
                            ...s,
                            ai_api_key: e.target.value,
                          }))
                        }
                        placeholder={
                          config.ai_provider === "anthropic"
                            ? "sk-ant-api03-..."
                            : "sk-..."
                        }
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        className="absolute right-1 top-1 h-7 w-7"
                        onClick={() => setShowApiKey(!showApiKey)}
                      >
                        {showApiKey ? (
                          <EyeOff className="h-3.5 w-3.5" />
                        ) : (
                          <Eye className="h-3.5 w-3.5" />
                        )}
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Model</Label>
                    <Select
                      value={config.ai_model}
                      onValueChange={(v) =>
                        setConfig((s) => ({ ...s, ai_model: v }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {config.ai_provider === "anthropic" ? (
                          <>
                            <SelectItem value="claude-sonnet-4-20250514">
                              Claude Sonnet 4
                            </SelectItem>
                            <SelectItem value="claude-opus-4-20250514">
                              Claude Opus 4
                            </SelectItem>
                            <SelectItem value="claude-haiku-4-20250514">
                              Claude Haiku 4
                            </SelectItem>
                          </>
                        ) : (
                          <>
                            <SelectItem value="gpt-4o">GPT-4o</SelectItem>
                            <SelectItem value="gpt-4o-mini">
                              GPT-4o Mini
                            </SelectItem>
                          </>
                        )}
                      </SelectContent>
                    </Select>
                  </div>

                  {config.ai_api_key && (
                    <Button
                      variant="outline"
                      className="w-full gap-2"
                      onClick={handleTestConnection}
                      disabled={testing}
                    >
                      {testing ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : testResult === "success" ? (
                        <Check className="h-4 w-4 text-green-500" />
                      ) : null}
                      {testing
                        ? "Testing..."
                        : testResult === "success"
                          ? "Connection successful!"
                          : testResult === "error"
                            ? "Failed - check your key"
                            : "Test Connection"}
                    </Button>
                  )}
                </div>
              </div>
            )}

            {/* Step 3: Personality */}
            {currentStep === "personality" && (
              <div>
                <h2 className="text-2xl font-bold text-center">
                  Personalize your Richy
                </h2>
                <p className="mt-2 text-center text-muted-foreground">
                  Choose how Richy communicates with you
                </p>

                <div className="mt-6 space-y-4">
                  <div className="space-y-2">
                    <Label>Name</Label>
                    <Input
                      value={config.buddy_name}
                      onChange={(e) =>
                        setConfig((s) => ({
                          ...s,
                          buddy_name: e.target.value,
                        }))
                      }
                      placeholder="Richy"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Personality</Label>
                    <div className="grid grid-cols-2 gap-2">
                      {presets.map((preset) => (
                        <Card
                          key={preset.id}
                          className={cn(
                            "cursor-pointer p-3 transition-colors",
                            config.preset === preset.id &&
                              "border-primary bg-primary/5"
                          )}
                          onClick={() =>
                            setConfig((s) => ({ ...s, preset: preset.id }))
                          }
                        >
                          <div className="text-sm font-medium">
                            {preset.label}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {preset.description}
                          </div>
                        </Card>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Custom Instructions (optional)</Label>
                    <Textarea
                      value={config.personality}
                      onChange={(e) =>
                        setConfig((s) => ({
                          ...s,
                          personality: e.target.value,
                        }))
                      }
                      placeholder="Any special instructions for your Richy..."
                      rows={3}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Step 4: Complete */}
            {currentStep === "complete" && (
              <div className="flex flex-col items-center text-center">
                <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-green-500/10">
                  <Check className="h-10 w-10 text-green-500" />
                </div>
                <h2 className="text-2xl font-bold">
                  {config.buddy_name} is ready!
                </h2>
                <p className="mt-3 text-muted-foreground max-w-sm">
                  Your personal AI agent is set up and ready to help. Start
                  chatting to explore what it can do.
                </p>

                <div className="mt-6 w-full space-y-3 text-left">
                  <div className="rounded-lg border p-3">
                    <div className="text-sm font-medium">Quick tips</div>
                    <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                      <li>
                        Ask {config.buddy_name} to search the web, run
                        calculations, or take notes
                      </li>
                      <li>
                        {config.buddy_name} learns your preferences over time
                      </li>
                      <li>
                        Visit Settings anytime to change configuration
                      </li>
                    </ul>
                  </div>
                </div>

                <Button
                  size="lg"
                  className="mt-6 w-full gap-2"
                  onClick={handleComplete}
                  disabled={saveBatch.isPending}
                >
                  {saveBatch.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Sparkles className="h-4 w-4" />
                  )}
                  Start chatting
                </Button>
              </div>
            )}
          </motion.div>
        </AnimatePresence>

        {/* Navigation */}
        {currentStep !== "complete" && (
          <div className="mt-8 flex justify-between">
            <Button
              variant="ghost"
              onClick={() => setStep((s) => s - 1)}
              disabled={step === 0}
              className="gap-1"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
            <Button
              onClick={() => setStep((s) => s + 1)}
              disabled={!canProceed}
              className="gap-1"
            >
              Next
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
