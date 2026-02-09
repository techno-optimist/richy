"use client";

import { useState, useEffect } from "react";
import {
  Settings,
  Save,
  Eye,
  EyeOff,
  MessageCircle,
  TrendingUp,
  AlertTriangle,
  Shield,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

export default function SettingsPage() {
  const { data: allSettings, refetch } = trpc.settings.getAll.useQuery();
  const setSetting = trpc.settings.setBatch.useMutation({
    onSuccess: () => {
      refetch();
      toast.success("Settings saved");
    },
  });

  const [showApiKey, setShowApiKey] = useState(false);
  const [showBotToken, setShowBotToken] = useState(false);
  const [showCryptoKey, setShowCryptoKey] = useState(false);
  const [showCryptoSecret, setShowCryptoSecret] = useState(false);
  const [showCryptoPanicKey, setShowCryptoPanicKey] = useState(false);
  const [formState, setFormState] = useState({
    buddy_name: "Richy",
    ai_provider: "anthropic",
    ai_model: "claude-sonnet-4-20250514",
    ai_background_provider: "",
    ai_background_model: "",
    ollama_base_url: "http://localhost:11434/v1",
    ai_api_key: "",
    personality: "",
    max_steps: "10",
    autonomous_mode: "off",
    telegram_bot_token: "",
    telegram_allowed_users: "",
    user_phone: "",
    imessage_polling_interval: "10",
    notify_imessage: "off",
    notify_telegram: "on",
    crypto_exchange: "coinbase",
    crypto_api_key: "",
    crypto_api_secret: "",
    crypto_passphrase: "",
    crypto_trading_enabled: "off",
    crypto_max_trade_usd: "100",
    crypto_sandbox_mode: "on",
    crypto_sentinel_enabled: "off",
    crypto_sentinel_interval: "30",
    crypto_sentinel_coins: "BTC,ETH",
    crypto_sentinel_sources: "reddit,twitter,news",
    crypto_sentinel_strategy: "",
    crypto_sentinel_auto_confirm: "off",
    crypto_sentinel_max_trades_per_day: "5",
    crypto_sentinel_daily_loss_limit_usd: "50",
    crypto_default_stop_loss_pct: "5",
    crypto_default_take_profit_pct: "10",
    crypto_guardian_interval: "120",
    crypto_trailing_stop_enabled: "off",
    crypto_trailing_stop_pct: "3",
    crypto_panic_api_key: "",
  });

  useEffect(() => {
    if (allSettings) {
      setFormState({
        buddy_name: (allSettings.buddy_name as string) || "Richy",
        ai_provider: (allSettings.ai_provider as string) || "anthropic",
        ai_model:
          (allSettings.ai_model as string) || "claude-sonnet-4-20250514",
        ai_background_provider:
          (allSettings.ai_background_provider as string) || "",
        ai_background_model:
          (allSettings.ai_background_model as string) || "",
        ollama_base_url:
          (allSettings.ollama_base_url as string) ||
          "http://localhost:11434/v1",
        ai_api_key: (allSettings.ai_api_key as string) || "",
        personality: (allSettings.personality as string) || "",
        max_steps: String(allSettings.max_steps || "10"),
        autonomous_mode: (allSettings.autonomous_mode as string) || "off",
        telegram_bot_token:
          (allSettings.telegram_bot_token as string) || "",
        telegram_allowed_users:
          (allSettings.telegram_allowed_users as string) || "",
        user_phone: (allSettings.user_phone as string) || "",
        imessage_polling_interval: String(
          allSettings.imessage_polling_interval || "10"
        ),
        notify_imessage: (allSettings.notify_imessage as string) || "off",
        notify_telegram: (allSettings.notify_telegram as string) || "on",
        crypto_exchange: (allSettings.crypto_exchange as string) || "coinbase",
        crypto_api_key: (allSettings.crypto_api_key as string) || "",
        crypto_api_secret: (allSettings.crypto_api_secret as string) || "",
        crypto_passphrase: (allSettings.crypto_passphrase as string) || "",
        crypto_trading_enabled:
          (allSettings.crypto_trading_enabled as string) || "off",
        crypto_max_trade_usd: String(
          allSettings.crypto_max_trade_usd || "100"
        ),
        crypto_sandbox_mode:
          (allSettings.crypto_sandbox_mode as string) || "on",
        crypto_sentinel_enabled:
          (allSettings.crypto_sentinel_enabled as string) || "off",
        crypto_sentinel_interval: String(
          allSettings.crypto_sentinel_interval || "30"
        ),
        crypto_sentinel_coins:
          (allSettings.crypto_sentinel_coins as string) || "BTC,ETH",
        crypto_sentinel_sources:
          (allSettings.crypto_sentinel_sources as string) ||
          "reddit,twitter,news",
        crypto_sentinel_strategy:
          (allSettings.crypto_sentinel_strategy as string) || "",
        crypto_sentinel_auto_confirm:
          (allSettings.crypto_sentinel_auto_confirm as string) || "off",
        crypto_sentinel_max_trades_per_day: String(
          allSettings.crypto_sentinel_max_trades_per_day || "5"
        ),
        crypto_sentinel_daily_loss_limit_usd: String(
          allSettings.crypto_sentinel_daily_loss_limit_usd || "50"
        ),
        crypto_default_stop_loss_pct: String(
          allSettings.crypto_default_stop_loss_pct || "5"
        ),
        crypto_default_take_profit_pct: String(
          allSettings.crypto_default_take_profit_pct || "10"
        ),
        crypto_guardian_interval: String(
          allSettings.crypto_guardian_interval || "120"
        ),
        crypto_trailing_stop_enabled:
          (allSettings.crypto_trailing_stop_enabled as string) || "off",
        crypto_trailing_stop_pct: String(
          allSettings.crypto_trailing_stop_pct || "3"
        ),
        crypto_panic_api_key: (allSettings.crypto_panic_api_key as string) || "",
      });
    }
  }, [allSettings]);

  const handleSave = () => {
    // Build settings, filtering out masked sensitive values that weren't changed
    const MASK = "••••••••";
    const settings: Record<string, unknown> = {
      ...formState,
      max_steps: parseInt(formState.max_steps) || 10,
      imessage_polling_interval:
        parseInt(formState.imessage_polling_interval) || 10,
      crypto_max_trade_usd:
        parseInt(formState.crypto_max_trade_usd) || 100,
      crypto_sentinel_interval:
        parseInt(formState.crypto_sentinel_interval) || 30,
      crypto_sentinel_max_trades_per_day:
        parseInt(formState.crypto_sentinel_max_trades_per_day) || 5,
      crypto_sentinel_daily_loss_limit_usd:
        parseInt(formState.crypto_sentinel_daily_loss_limit_usd) || 50,
      crypto_default_stop_loss_pct:
        parseInt(formState.crypto_default_stop_loss_pct) || 5,
      crypto_default_take_profit_pct:
        parseInt(formState.crypto_default_take_profit_pct) || 10,
      crypto_guardian_interval:
        parseInt(formState.crypto_guardian_interval) || 120,
      crypto_trailing_stop_pct:
        parseInt(formState.crypto_trailing_stop_pct) || 3,
    };

    // Don't overwrite sensitive keys with the mask placeholder
    for (const key of Object.keys(settings)) {
      if (settings[key] === MASK) {
        delete settings[key];
      }
    }

    setSetting.mutate({ settings });
  };

  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto max-w-2xl p-4 pb-24 md:pb-4">
        <div className="flex items-center gap-2 mb-6">
          <Settings className="h-5 w-5" />
          <h1 className="text-lg font-semibold">Settings</h1>
        </div>

        <Tabs defaultValue="general">
          <TabsList className="w-full justify-start">
            <TabsTrigger value="general">General</TabsTrigger>
            <TabsTrigger value="ai">AI Provider</TabsTrigger>
            <TabsTrigger value="autonomous">Autonomous</TabsTrigger>
            <TabsTrigger value="trading">Trading</TabsTrigger>
            <TabsTrigger value="data">Data</TabsTrigger>
          </TabsList>

          <TabsContent value="general" className="space-y-4 mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Personality</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Richy Name</Label>
                  <Input
                    value={formState.buddy_name}
                    onChange={(e) =>
                      setFormState((s) => ({
                        ...s,
                        buddy_name: e.target.value,
                      }))
                    }
                    placeholder="Richy"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Custom Instructions</Label>
                  <Textarea
                    value={formState.personality}
                    onChange={(e) =>
                      setFormState((s) => ({
                        ...s,
                        personality: e.target.value,
                      }))
                    }
                    placeholder="Tell Richy how you want it to behave..."
                    rows={4}
                  />
                  <p className="text-xs text-muted-foreground">
                    These instructions shape how Richy responds to you
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="ai" className="space-y-4 mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">AI Provider</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Provider</Label>
                  <Select
                    value={formState.ai_provider}
                    onValueChange={(v) =>
                      setFormState((s) => ({ ...s, ai_provider: v }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="anthropic">
                        Anthropic (Claude)
                      </SelectItem>
                      <SelectItem value="openai">OpenAI (GPT)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>API Key</Label>
                  <div className="relative">
                    <Input
                      type={showApiKey ? "text" : "password"}
                      value={formState.ai_api_key}
                      onChange={(e) =>
                        setFormState((s) => ({
                          ...s,
                          ai_api_key: e.target.value,
                        }))
                      }
                      placeholder={
                        formState.ai_provider === "anthropic"
                          ? "sk-ant-..."
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
                    value={formState.ai_model}
                    onValueChange={(v) =>
                      setFormState((s) => ({ ...s, ai_model: v }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {formState.ai_provider === "anthropic" ? (
                        <>
                          <SelectItem value="claude-sonnet-4-20250514">
                            Claude Sonnet 4
                          </SelectItem>
                          <SelectItem value="claude-opus-4-20250514">
                            Claude Opus 4
                          </SelectItem>
                          <SelectItem value="claude-haiku-4-5-20251001">
                            Claude Haiku 4
                          </SelectItem>
                        </>
                      ) : (
                        <>
                          <SelectItem value="gpt-4o">GPT-4o</SelectItem>
                          <SelectItem value="gpt-4o-mini">
                            GPT-4o Mini
                          </SelectItem>
                          <SelectItem value="o3-mini">o3-mini</SelectItem>
                        </>
                      )}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Background Provider</Label>
                  <Select
                    value={formState.ai_background_provider || "same"}
                    onValueChange={(v) => {
                      const provider = v === "same" ? "" : v;
                      const model =
                        v === "ollama"
                          ? "qwen3:8b"
                          : v === "same"
                            ? ""
                            : formState.ai_background_model;
                      setFormState((s) => ({
                        ...s,
                        ai_background_provider: provider,
                        ai_background_model: model,
                      }));
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="same">
                        Same as main (costs tokens)
                      </SelectItem>
                      <SelectItem value="ollama">
                        Ollama — local, free (Recommended)
                      </SelectItem>
                      <SelectItem value="anthropic">
                        Anthropic (cheaper model)
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Used for iMessage replies, scheduled tasks, and sentinel scans.
                  </p>
                </div>

                {formState.ai_background_provider === "ollama" && (
                  <>
                    <div className="space-y-2">
                      <Label>Ollama Model</Label>
                      <Input
                        value={formState.ai_background_model}
                        onChange={(e) =>
                          setFormState((s) => ({
                            ...s,
                            ai_background_model: e.target.value,
                          }))
                        }
                        placeholder="qwen3:8b"
                      />
                      <p className="text-xs text-muted-foreground">
                        Model name from `ollama list`. qwen3:8b is a good default.
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label>Ollama URL</Label>
                      <Input
                        value={formState.ollama_base_url}
                        onChange={(e) =>
                          setFormState((s) => ({
                            ...s,
                            ollama_base_url: e.target.value,
                          }))
                        }
                        placeholder="http://localhost:11434/v1"
                      />
                    </div>
                  </>
                )}

                {formState.ai_background_provider === "anthropic" && (
                  <div className="space-y-2">
                    <Label>Background Model</Label>
                    <Select
                      value={formState.ai_background_model || "claude-haiku-4-5-20251001"}
                      onValueChange={(v) =>
                        setFormState((s) => ({
                          ...s,
                          ai_background_model: v,
                        }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="claude-haiku-4-5-20251001">
                          Claude Haiku 4 (cheapest)
                        </SelectItem>
                        <SelectItem value="claude-sonnet-4-20250514">
                          Claude Sonnet 4
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div className="space-y-2">
                  <Label>Max Agent Steps</Label>
                  <Input
                    type="number"
                    min={1}
                    max={20}
                    value={formState.max_steps}
                    onChange={(e) =>
                      setFormState((s) => ({
                        ...s,
                        max_steps: e.target.value,
                      }))
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    Maximum tool-use iterations per response (1-20)
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="autonomous" className="space-y-4 mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Notifications</CardTitle>
                <CardDescription>
                  Control how Richy sends you task results and alerts
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>iMessage Notifications</Label>
                    <p className="text-xs text-muted-foreground">
                      Send task results and alerts via iMessage
                    </p>
                  </div>
                  <Switch
                    checked={formState.notify_imessage === "on"}
                    onCheckedChange={(checked) =>
                      setFormState((s) => ({
                        ...s,
                        notify_imessage: checked ? "on" : "off",
                      }))
                    }
                  />
                </div>

                {formState.notify_imessage === "on" && (
                  <div className="space-y-2">
                    <Label>Phone Number</Label>
                    <Input
                      value={formState.user_phone}
                      onChange={(e) =>
                        setFormState((s) => ({
                          ...s,
                          user_phone: e.target.value,
                        }))
                      }
                      placeholder="+1234567890"
                    />
                    <p className="text-xs text-muted-foreground">
                      Your iMessage-capable phone number
                    </p>
                  </div>
                )}

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Telegram Notifications</Label>
                    <p className="text-xs text-muted-foreground">
                      Send task results and alerts via Telegram bot
                    </p>
                  </div>
                  <Switch
                    checked={formState.notify_telegram === "on"}
                    onCheckedChange={(checked) =>
                      setFormState((s) => ({
                        ...s,
                        notify_telegram: checked ? "on" : "off",
                      }))
                    }
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <MessageCircle className="h-4 w-4" />
                  Telegram Bot
                </CardTitle>
                <CardDescription>
                  Connect a Telegram bot so you can message Richy from
                  anywhere. Create a bot via @BotFather on Telegram.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Autonomous Mode</Label>
                    <p className="text-xs text-muted-foreground">
                      When on, Richy listens for Telegram messages and
                      replies automatically
                    </p>
                  </div>
                  <Switch
                    checked={formState.autonomous_mode === "on"}
                    onCheckedChange={(checked) =>
                      setFormState((s) => ({
                        ...s,
                        autonomous_mode: checked ? "on" : "off",
                      }))
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label>Bot Token</Label>
                  <div className="relative">
                    <Input
                      type={showBotToken ? "text" : "password"}
                      value={formState.telegram_bot_token}
                      onChange={(e) =>
                        setFormState((s) => ({
                          ...s,
                          telegram_bot_token: e.target.value,
                        }))
                      }
                      placeholder="123456:ABC-DEF..."
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute right-1 top-1 h-7 w-7"
                      onClick={() => setShowBotToken(!showBotToken)}
                    >
                      {showBotToken ? (
                        <EyeOff className="h-3.5 w-3.5" />
                      ) : (
                        <Eye className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Get this from @BotFather on Telegram
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Allowed Users</Label>
                  <Input
                    value={formState.telegram_allowed_users}
                    onChange={(e) =>
                      setFormState((s) => ({
                        ...s,
                        telegram_allowed_users: e.target.value,
                      }))
                    }
                    placeholder="@yourusername, 123456789"
                  />
                  <p className="text-xs text-muted-foreground">
                    Comma-separated Telegram usernames or user IDs. Leave
                    empty to allow anyone.
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Setup Guide</CardTitle>
              </CardHeader>
              <CardContent>
                <ol className="list-decimal list-inside space-y-1.5 text-sm text-muted-foreground">
                  <li>
                    Open Telegram and search for{" "}
                    <strong className="text-foreground">@BotFather</strong>
                  </li>
                  <li>
                    Send <code className="bg-muted px-1 rounded text-[11px]">/newbot</code>{" "}
                    and follow the prompts to create your bot
                  </li>
                  <li>Copy the bot token and paste it above</li>
                  <li>Turn on Autonomous Mode and save settings</li>
                  <li>Restart the dev server</li>
                  <li>Find your bot in Telegram and send it a message</li>
                </ol>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="trading" className="space-y-4 mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <TrendingUp className="h-4 w-4" />
                  Crypto Trading
                </CardTitle>
                <CardDescription>
                  Connect to a cryptocurrency exchange to enable price checks,
                  portfolio viewing, and trading via the agent.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Exchange</Label>
                  <Select
                    value={formState.crypto_exchange}
                    onValueChange={(v) =>
                      setFormState((s) => ({ ...s, crypto_exchange: v }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="coinbase">Coinbase</SelectItem>
                      <SelectItem value="binance">Binance</SelectItem>
                      <SelectItem value="kraken">Kraken</SelectItem>
                      <SelectItem value="bybit">Bybit</SelectItem>
                      <SelectItem value="okx">OKX</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>API Key</Label>
                  <div className="relative">
                    <Input
                      type={showCryptoKey ? "text" : "password"}
                      value={formState.crypto_api_key}
                      onChange={(e) =>
                        setFormState((s) => ({
                          ...s,
                          crypto_api_key: e.target.value,
                        }))
                      }
                      placeholder="Your exchange API key"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute right-1 top-1 h-7 w-7"
                      onClick={() => setShowCryptoKey(!showCryptoKey)}
                    >
                      {showCryptoKey ? (
                        <EyeOff className="h-3.5 w-3.5" />
                      ) : (
                        <Eye className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>API Secret</Label>
                  <div className="relative">
                    <Input
                      type={showCryptoSecret ? "text" : "password"}
                      value={formState.crypto_api_secret}
                      onChange={(e) =>
                        setFormState((s) => ({
                          ...s,
                          crypto_api_secret: e.target.value,
                        }))
                      }
                      placeholder="Your exchange API secret"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute right-1 top-1 h-7 w-7"
                      onClick={() => setShowCryptoSecret(!showCryptoSecret)}
                    >
                      {showCryptoSecret ? (
                        <EyeOff className="h-3.5 w-3.5" />
                      ) : (
                        <Eye className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Passphrase (optional)</Label>
                  <Input
                    type="password"
                    value={formState.crypto_passphrase}
                    onChange={(e) =>
                      setFormState((s) => ({
                        ...s,
                        crypto_passphrase: e.target.value,
                      }))
                    }
                    placeholder="Required by some exchanges (e.g. Coinbase)"
                  />
                  <p className="text-xs text-muted-foreground">
                    Some exchanges require a passphrase in addition to API
                    key/secret
                  </p>
                </div>

                <div className="border-t pt-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Enable Trading</Label>
                      <p className="text-xs text-muted-foreground">
                        When off, only price checks and market info are
                        available
                      </p>
                    </div>
                    <Switch
                      checked={formState.crypto_trading_enabled === "on"}
                      onCheckedChange={(checked) =>
                        setFormState((s) => ({
                          ...s,
                          crypto_trading_enabled: checked ? "on" : "off",
                        }))
                      }
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Sandbox Mode</Label>
                      <p className="text-xs text-muted-foreground">
                        Use exchange testnet for paper trading (no real money)
                      </p>
                    </div>
                    <Switch
                      checked={formState.crypto_sandbox_mode === "on"}
                      onCheckedChange={(checked) =>
                        setFormState((s) => ({
                          ...s,
                          crypto_sandbox_mode: checked ? "on" : "off",
                        }))
                      }
                    />
                  </div>

                  {formState.crypto_sandbox_mode === "off" && (
                    <div className="flex items-start gap-2 rounded-lg border border-yellow-500/50 bg-yellow-500/5 p-3">
                      <AlertTriangle className="h-4 w-4 text-yellow-500 shrink-0 mt-0.5" />
                      <p className="text-sm text-yellow-600 dark:text-yellow-400">
                        Sandbox mode is OFF — <strong>real money</strong> will
                        be used for trades. Proceed with caution.
                      </p>
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label>Max Trade (USD)</Label>
                    <Input
                      type="number"
                      min={1}
                      max={10000}
                      value={formState.crypto_max_trade_usd}
                      onChange={(e) =>
                        setFormState((s) => ({
                          ...s,
                          crypto_max_trade_usd: e.target.value,
                        }))
                      }
                    />
                    <p className="text-xs text-muted-foreground">
                      Maximum value of a single trade in USD ($1–$10,000)
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Setup Guide</CardTitle>
              </CardHeader>
              <CardContent>
                <ol className="list-decimal list-inside space-y-1.5 text-sm text-muted-foreground">
                  <li>
                    Create an account on your chosen exchange (e.g.{" "}
                    <strong className="text-foreground">Coinbase</strong>,{" "}
                    <strong className="text-foreground">Binance</strong>)
                  </li>
                  <li>
                    Navigate to API settings and create a new API key
                  </li>
                  <li>
                    Enable <strong className="text-foreground">read</strong> and{" "}
                    <strong className="text-foreground">trade</strong>{" "}
                    permissions — do NOT enable withdrawal
                  </li>
                  <li>Copy the API key, secret, and passphrase (if any)</li>
                  <li>Paste them above and save settings</li>
                  <li>
                    Keep <strong className="text-foreground">Sandbox Mode ON</strong>{" "}
                    while testing
                  </li>
                  <li>
                    Test with a simple price check:{" "}
                    <code className="bg-muted px-1 rounded text-[11px]">
                      What&apos;s the price of BTC/USDT?
                    </code>
                  </li>
                </ol>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" />
                  Crypto Sentinel
                </CardTitle>
                <CardDescription>
                  Autonomous background monitor that scans Reddit, Twitter/X,
                  and crypto news for sentiment and trading signals.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Enable Sentinel</Label>
                    <p className="text-xs text-muted-foreground">
                      Runs automatically on a schedule (requires restart)
                    </p>
                  </div>
                  <Switch
                    checked={formState.crypto_sentinel_enabled === "on"}
                    onCheckedChange={(checked) =>
                      setFormState((s) => ({
                        ...s,
                        crypto_sentinel_enabled: checked ? "on" : "off",
                      }))
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label>Check Interval (minutes)</Label>
                  <Input
                    type="number"
                    min={5}
                    max={1440}
                    value={formState.crypto_sentinel_interval}
                    onChange={(e) =>
                      setFormState((s) => ({
                        ...s,
                        crypto_sentinel_interval: e.target.value,
                      }))
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    How often to scan markets (5–1440 minutes)
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Coins to Monitor</Label>
                  <Input
                    value={formState.crypto_sentinel_coins}
                    onChange={(e) =>
                      setFormState((s) => ({
                        ...s,
                        crypto_sentinel_coins: e.target.value,
                      }))
                    }
                    placeholder="BTC,ETH,SOL"
                  />
                  <p className="text-xs text-muted-foreground">
                    Comma-separated list of coins to track
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Sources</Label>
                  <Input
                    value={formState.crypto_sentinel_sources}
                    onChange={(e) =>
                      setFormState((s) => ({
                        ...s,
                        crypto_sentinel_sources: e.target.value,
                      }))
                    }
                    placeholder="reddit,twitter,news"
                  />
                  <p className="text-xs text-muted-foreground">
                    Comma-separated: reddit, twitter, news
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>CryptoPanic API Key</Label>
                  <div className="relative">
                    <Input
                      type={showCryptoPanicKey ? "text" : "password"}
                      value={formState.crypto_panic_api_key}
                      onChange={(e) =>
                        setFormState((s) => ({
                          ...s,
                          crypto_panic_api_key: e.target.value,
                        }))
                      }
                      placeholder="Your CryptoPanic API key"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute right-1 top-1 h-7 w-7"
                      onClick={() =>
                        setShowCryptoPanicKey(!showCryptoPanicKey)
                      }
                    >
                      {showCryptoPanicKey ? (
                        <EyeOff className="h-3.5 w-3.5" />
                      ) : (
                        <Eye className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Free at cryptopanic.com/developers/api — enables real-time
                    crypto news
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Trading Strategy</Label>
                  <Textarea
                    value={formState.crypto_sentinel_strategy}
                    onChange={(e) =>
                      setFormState((s) => ({
                        ...s,
                        crypto_sentinel_strategy: e.target.value,
                      }))
                    }
                    placeholder="e.g. Only buy on strong bullish signals with >70% positive sentiment..."
                    rows={3}
                  />
                  <p className="text-xs text-muted-foreground">
                    Custom instructions for how the sentinel should trade
                  </p>
                </div>

                <div className="border-t pt-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Auto-Confirm Trades</Label>
                      <p className="text-xs text-muted-foreground">
                        When off, sentinel only previews trades for your review
                      </p>
                    </div>
                    <Switch
                      checked={
                        formState.crypto_sentinel_auto_confirm === "on"
                      }
                      onCheckedChange={(checked) =>
                        setFormState((s) => ({
                          ...s,
                          crypto_sentinel_auto_confirm: checked
                            ? "on"
                            : "off",
                        }))
                      }
                    />
                  </div>

                  {formState.crypto_sentinel_auto_confirm === "on" && (
                    <div className="flex items-start gap-2 rounded-lg border border-yellow-500/50 bg-yellow-500/5 p-3">
                      <AlertTriangle className="h-4 w-4 text-yellow-500 shrink-0 mt-0.5" />
                      <p className="text-sm text-yellow-600 dark:text-yellow-400">
                        Auto-confirm is ON — the sentinel will{" "}
                        <strong>execute trades automatically</strong> without
                        your approval.
                      </p>
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label>Max Trades Per Day</Label>
                    <Input
                      type="number"
                      min={1}
                      max={100}
                      value={formState.crypto_sentinel_max_trades_per_day}
                      onChange={(e) =>
                        setFormState((s) => ({
                          ...s,
                          crypto_sentinel_max_trades_per_day: e.target.value,
                        }))
                      }
                    />
                    <p className="text-xs text-muted-foreground">
                      Sentinel stops trading after this many trades per day
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label>Daily Loss Limit (USD)</Label>
                    <Input
                      type="number"
                      min={1}
                      max={10000}
                      value={formState.crypto_sentinel_daily_loss_limit_usd}
                      onChange={(e) =>
                        setFormState((s) => ({
                          ...s,
                          crypto_sentinel_daily_loss_limit_usd: e.target.value,
                        }))
                      }
                    />
                    <p className="text-xs text-muted-foreground">
                      Sentinel stops trading if daily losses exceed this amount
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Shield className="h-4 w-4" />
                  Position Protection
                </CardTitle>
                <CardDescription>
                  Automatic stop-loss and take-profit enforcement. The Guardian
                  runs independently from the sentinel — no AI calls, just price
                  checks.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Default Stop-Loss (%)</Label>
                  <Input
                    type="number"
                    min={1}
                    max={50}
                    value={formState.crypto_default_stop_loss_pct}
                    onChange={(e) =>
                      setFormState((s) => ({
                        ...s,
                        crypto_default_stop_loss_pct: e.target.value,
                      }))
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    Default stop-loss percentage below entry price (1-50%)
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Default Take-Profit (%)</Label>
                  <Input
                    type="number"
                    min={1}
                    max={100}
                    value={formState.crypto_default_take_profit_pct}
                    onChange={(e) =>
                      setFormState((s) => ({
                        ...s,
                        crypto_default_take_profit_pct: e.target.value,
                      }))
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    Default take-profit percentage above entry price (1-100%)
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Guardian Check Interval (seconds)</Label>
                  <Input
                    type="number"
                    min={30}
                    max={600}
                    value={formState.crypto_guardian_interval}
                    onChange={(e) =>
                      setFormState((s) => ({
                        ...s,
                        crypto_guardian_interval: e.target.value,
                      }))
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    How often the guardian checks prices (30-600 seconds,
                    requires restart)
                  </p>
                </div>

                <div className="border-t pt-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Trailing Stop</Label>
                      <p className="text-xs text-muted-foreground">
                        Automatically raise stop-loss as price increases
                      </p>
                    </div>
                    <Switch
                      checked={formState.crypto_trailing_stop_enabled === "on"}
                      onCheckedChange={(checked) =>
                        setFormState((s) => ({
                          ...s,
                          crypto_trailing_stop_enabled: checked ? "on" : "off",
                        }))
                      }
                    />
                  </div>

                  {formState.crypto_trailing_stop_enabled === "on" && (
                    <div className="space-y-2">
                      <Label>Trailing Stop Distance (%)</Label>
                      <Input
                        type="number"
                        min={1}
                        max={20}
                        value={formState.crypto_trailing_stop_pct}
                        onChange={(e) =>
                          setFormState((s) => ({
                            ...s,
                            crypto_trailing_stop_pct: e.target.value,
                          }))
                        }
                      />
                      <p className="text-xs text-muted-foreground">
                        Stop-loss trails this percentage below the highest price
                        reached
                      </p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="data" className="space-y-4 mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Data Management</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  All data is stored locally in a SQLite database.
                </p>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" disabled>
                    Export Data
                  </Button>
                  <Button variant="outline" size="sm" disabled>
                    Import Data
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <div className="mt-6">
          <Button onClick={handleSave} className="gap-2">
            <Save className="h-4 w-4" />
            Save Settings
          </Button>
        </div>
      </div>
    </div>
  );
}
