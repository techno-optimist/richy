"use client";

import { useState, useEffect } from "react";
import {
  Activity,
  TrendingUp,
  TrendingDown,
  Minus,
  Clock,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Zap,
  Shield,
  BarChart3,
  CircleDot,
  Settings,
  Save,
  Crown,
  Loader2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { formatDistanceToNow, format } from "date-fns";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

const COIN_COLORS: Record<string, string> = {
  BTC: "#f7931a",
  ETH: "#627eea",
  SOL: "#9945ff",
  AVAX: "#e84142",
  DOGE: "#c2a633",
  XRP: "#00aae4",
  ADA: "#0033ad",
  DOT: "#e6007a",
};

function getCoinColor(coin: string): string {
  return COIN_COLORS[coin.toUpperCase()] || "#888888";
}

export default function SentinelPage() {
  const { data: runs } = trpc.crypto.sentinelRuns.useQuery(
    { limit: 20 },
    { refetchInterval: 30000 }
  );
  const { data: config } = trpc.crypto.config.useQuery(
    undefined,
    { refetchInterval: 60000 }
  );
  const { data: dailyStats } = trpc.crypto.dailyStats.useQuery(
    undefined,
    { refetchInterval: 30000 }
  );
  const { data: trades } = trpc.crypto.trades.useQuery(
    { limit: 20 },
    { refetchInterval: 30000 }
  );
  const { data: positions } = trpc.crypto.positions.useQuery(
    undefined,
    { refetchInterval: 15000 }
  );
  const { data: ceoDirective } = trpc.crypto.ceoDirective.useQuery(
    undefined,
    { refetchInterval: 60000 }
  );

  const utils = trpc.useUtils();
  const triggerCEO = trpc.crypto.triggerCEOBriefing.useMutation({
    onSuccess: (result) => {
      utils.crypto.ceoDirective.invalidate();
      if (result.success) {
        toast.success("CEO briefing completed");
      } else {
        toast.error(`CEO briefing failed: ${result.error}`);
      }
    },
    onError: (err) => {
      toast.error(`CEO briefing error: ${err.message}`);
    },
  });

  const latestRun = runs?.[0];
  const sentiment = latestRun?.sentiment as Record<string, { score: number; label: string }> | null;
  const coins = config?.coins?.split(",").map((c: string) => c.trim()) || [];

  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto max-w-5xl p-4 pb-24 md:pb-4 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            <h1 className="text-lg font-semibold">Sentinel</h1>
          </div>
          {config && (
            <div className="flex items-center gap-2">
              {config.sandboxMode && (
                <Badge variant="outline" className="text-yellow-500 border-yellow-500/50">
                  Sandbox
                </Badge>
              )}
              <Badge
                variant={config.enabled ? "default" : "secondary"}
                className={config.enabled ? "bg-emerald-600 hover:bg-emerald-700" : ""}
              >
                <span className={config.enabled ? "mr-1.5 h-1.5 w-1.5 rounded-full bg-white animate-pulse inline-block" : "hidden"} />
                {config.enabled ? "Active" : "Disabled"}
              </Badge>
            </div>
          )}
        </div>

        {/* Status Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatusCard
            icon={<Clock className="h-4 w-4 text-muted-foreground" />}
            label="Last Run"
            value={latestRun?.createdAt ? formatDistanceToNow(latestRun.createdAt, { addSuffix: true }) : "Never"}
            sub={latestRun?.durationMs ? `${(latestRun.durationMs / 1000).toFixed(0)}s` : undefined}
          />
          <StatusCard
            icon={<BarChart3 className="h-4 w-4 text-muted-foreground" />}
            label="Trades Today"
            value={`${dailyStats?.tradesCount ?? 0}${config ? `/${config.maxTradesPerDay}` : ""}`}
            sub={`Vol: $${(dailyStats?.volume ?? 0).toFixed(0)}`}
          />
          <StatusCard
            icon={<TrendingUp className="h-4 w-4 text-muted-foreground" />}
            label="Daily P&L"
            value={`${(dailyStats?.realizedPnl ?? 0) >= 0 ? "+" : ""}$${(dailyStats?.realizedPnl ?? 0).toFixed(2)}`}
            valueColor={(dailyStats?.realizedPnl ?? 0) >= 0 ? "text-emerald-500" : "text-red-500"}
            sub={`W: ${dailyStats?.winners ?? 0} / L: ${dailyStats?.losers ?? 0}`}
          />
          <StatusCard
            icon={<Zap className="h-4 w-4 text-muted-foreground" />}
            label="Interval"
            value={config ? `${config.interval}m` : "—"}
            sub={config?.autoConfirm ? "Auto-trade ON" : "Preview only"}
          />
        </div>

        {/* Sentiment Overview */}
        {sentiment && Object.keys(sentiment).length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Sentiment</CardTitle>
              <CardDescription>Latest AI analysis per coin</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {Object.entries(sentiment).map(([coin, data]) => (
                  <SentimentCard key={coin} coin={coin} score={data.score} label={data.label} />
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Sentiment History Chart */}
        {runs && runs.length > 1 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Sentiment History</CardTitle>
              <CardDescription>Score over last {runs.length} runs (0 = bearish, 1 = bullish)</CardDescription>
            </CardHeader>
            <CardContent>
              <SentimentHistoryChart runs={runs} coins={coins} />
            </CardContent>
          </Card>
        )}

        {/* CEO Directive */}
        <CEODirectiveCard
          directive={ceoDirective}
          onRequestBriefing={() => triggerCEO.mutate()}
          isBriefing={triggerCEO.isPending}
          ceoEnabled={config?.ceoEnabled ?? false}
        />

        {/* Signals & Actions Feed */}
        <RunHistorySection runs={runs} />

        {/* Trade Activity */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Recent Trades</CardTitle>
          </CardHeader>
          <CardContent>
            {!trades || trades.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No trades yet</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-muted-foreground">
                      <th className="text-left py-2 pr-3 font-medium">Time</th>
                      <th className="text-left py-2 pr-3 font-medium">Symbol</th>
                      <th className="text-left py-2 pr-3 font-medium">Side</th>
                      <th className="text-right py-2 pr-3 font-medium">Amount</th>
                      <th className="text-right py-2 pr-3 font-medium">Price</th>
                      <th className="text-right py-2 pr-3 font-medium">Cost</th>
                      <th className="text-left py-2 font-medium">Source</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trades.map((t) => (
                      <tr key={t.id} className="border-b border-border/50 hover:bg-muted/30">
                        <td className="py-2 pr-3 text-muted-foreground">
                          {t.createdAt ? formatDistanceToNow(t.createdAt, { addSuffix: true }) : "—"}
                        </td>
                        <td className="py-2 pr-3 font-medium">{t.symbol}</td>
                        <td className="py-2 pr-3">
                          <Badge
                            variant="outline"
                            className={t.side === "buy"
                              ? "text-emerald-500 border-emerald-500/50"
                              : "text-red-500 border-red-500/50"
                            }
                          >
                            {t.side.toUpperCase()}
                          </Badge>
                        </td>
                        <td className="py-2 pr-3 text-right tabular-nums">{t.amount.toFixed(6)}</td>
                        <td className="py-2 pr-3 text-right tabular-nums">
                          {t.price ? `$${t.price.toFixed(2)}` : "—"}
                        </td>
                        <td className="py-2 pr-3 text-right tabular-nums">
                          {t.cost ? `$${t.cost.toFixed(2)}` : "—"}
                        </td>
                        <td className="py-2">
                          <SourceBadge source={t.source} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Open Positions */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Shield className="h-4 w-4" />
              Open Positions
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!positions || positions.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No open positions</p>
            ) : (
              <div className="grid gap-3">
                {positions.map((p) => (
                  <PositionCard key={p.id} position={p} />
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Agent Management */}
        <AgentManagement config={config} />
      </div>
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────

function StatusCard({
  icon,
  label,
  value,
  valueColor,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  valueColor?: string;
  sub?: string;
}) {
  return (
    <Card>
      <CardContent className="pt-4 pb-3 px-4">
        <div className="flex items-center gap-2 mb-1">
          {icon}
          <span className="text-xs text-muted-foreground">{label}</span>
        </div>
        <p className={`text-xl font-semibold tabular-nums ${valueColor || ""}`}>{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </CardContent>
    </Card>
  );
}

function SentimentCard({
  coin,
  score,
  label,
}: {
  coin: string;
  score: number;
  label: string;
}) {
  const color = score >= 0.6 ? "text-emerald-500" : score <= 0.4 ? "text-red-500" : "text-yellow-500";
  const bgColor = score >= 0.6 ? "bg-emerald-500" : score <= 0.4 ? "bg-red-500" : "bg-yellow-500";
  const Icon = score >= 0.6 ? TrendingUp : score <= 0.4 ? TrendingDown : Minus;

  return (
    <div className="flex items-center gap-3 rounded-lg border p-3">
      <div
        className="flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold text-white"
        style={{ backgroundColor: getCoinColor(coin) }}
      >
        {coin.substring(0, 3)}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="font-medium text-sm">{coin}</span>
          <Icon className={`h-3.5 w-3.5 ${color}`} />
        </div>
        <div className="flex items-center gap-2 mt-1">
          <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${bgColor}`}
              style={{ width: `${Math.round(score * 100)}%` }}
            />
          </div>
          <span className={`text-xs font-medium ${color}`}>{label}</span>
        </div>
      </div>
    </div>
  );
}

function SentimentHistoryChart({
  runs,
  coins,
}: {
  runs: any[];
  coins: string[];
}) {
  // Build chart data from runs (oldest first)
  const chartData = [...runs].reverse().map((run) => {
    const point: Record<string, any> = {
      time: run.createdAt ? format(run.createdAt, "HH:mm") : "?",
      fullTime: run.createdAt ? format(run.createdAt, "MMM d, HH:mm") : "?",
    };
    const sentiment = run.sentiment as Record<string, { score: number }> | null;
    if (sentiment) {
      for (const [coin, data] of Object.entries(sentiment)) {
        point[coin] = data.score;
      }
    }
    return point;
  });

  // Get all coins that appear in any run
  const allCoins = new Set<string>();
  for (const run of runs) {
    const sentiment = run.sentiment as Record<string, any> | null;
    if (sentiment) {
      for (const coin of Object.keys(sentiment)) {
        allCoins.add(coin);
      }
    }
  }

  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData}>
          <defs>
            {[...allCoins].map((coin) => (
              <linearGradient key={coin} id={`gradient-${coin}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={getCoinColor(coin)} stopOpacity={0.3} />
                <stop offset="95%" stopColor={getCoinColor(coin)} stopOpacity={0} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
          <XAxis dataKey="time" className="text-xs" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
          <YAxis domain={[0, 1]} className="text-xs" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
          <Tooltip
            contentStyle={{
              backgroundColor: "hsl(var(--card))",
              border: "1px solid hsl(var(--border))",
              borderRadius: "8px",
              fontSize: "12px",
            }}
            labelFormatter={(_, payload) => payload?.[0]?.payload?.fullTime || ""}
            formatter={((value: any, name: any) => [`${(Number(value) * 100).toFixed(0)}%`, name]) as any}
          />
          {[...allCoins].map((coin) => (
            <Area
              key={coin}
              type="monotone"
              dataKey={coin}
              stroke={getCoinColor(coin)}
              fill={`url(#gradient-${coin})`}
              strokeWidth={2}
              dot={false}
              connectNulls
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function AgentManagement({ config }: { config: any }) {
  const [showConfig, setShowConfig] = useState(false);
  const [form, setForm] = useState({
    crypto_sentinel_enabled: "off",
    crypto_sentinel_interval: "30",
    crypto_sentinel_coins: "BTC,ETH",
    crypto_trading_enabled: "off",
    crypto_sentinel_auto_confirm: "off",
    crypto_sentinel_max_trades_per_day: "5",
    crypto_sentinel_daily_loss_limit_usd: "50",
    crypto_max_trade_usd: "100",
    crypto_sandbox_mode: "on",
    crypto_default_stop_loss_pct: "5",
    crypto_default_take_profit_pct: "10",
    crypto_trailing_stop_enabled: "off",
    crypto_trailing_stop_pct: "3",
    crypto_ceo_enabled: "off",
    crypto_ceo_briefing_hour: "6",
    crypto_ceo_escalation_enabled: "on",
  });

  const utils = trpc.useUtils();
  const updateConfig = trpc.crypto.updateConfig.useMutation({
    onSuccess: () => {
      utils.crypto.config.invalidate();
      toast.success("Sentinel config saved");
    },
  });

  useEffect(() => {
    if (config) {
      setForm({
        crypto_sentinel_enabled: config.enabled ? "on" : "off",
        crypto_sentinel_interval: String(config.interval),
        crypto_sentinel_coins: config.coins,
        crypto_trading_enabled: config.tradingEnabled ? "on" : "off",
        crypto_sentinel_auto_confirm: config.autoConfirm ? "on" : "off",
        crypto_sentinel_max_trades_per_day: String(config.maxTradesPerDay),
        crypto_sentinel_daily_loss_limit_usd: String(config.dailyLossLimit),
        crypto_max_trade_usd: String(config.maxTradeUsd),
        crypto_sandbox_mode: config.sandboxMode ? "on" : "off",
        crypto_default_stop_loss_pct: String(config.stopLossPct),
        crypto_default_take_profit_pct: String(config.takeProfitPct),
        crypto_trailing_stop_enabled: config.trailingStop ? "on" : "off",
        crypto_trailing_stop_pct: String(config.trailingStopPct),
        crypto_ceo_enabled: config.ceoEnabled ? "on" : "off",
        crypto_ceo_briefing_hour: String(config.ceoBriefingHour ?? 6),
        crypto_ceo_escalation_enabled: config.ceoEscalationEnabled ? "on" : "off",
      });
    }
  }, [config]);

  return (
    <Card>
      <CardHeader
        className="pb-3 cursor-pointer select-none"
        onClick={() => setShowConfig(!showConfig)}
      >
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Settings className="h-4 w-4" />
              Agent Management
            </CardTitle>
            <CardDescription>
              Configure sentinel behavior, trade limits, and risk controls
            </CardDescription>
          </div>
          <button className="p-1 text-muted-foreground hover:text-foreground transition-colors">
            {showConfig ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </button>
        </div>
      </CardHeader>
      {showConfig && (
        <CardContent className="space-y-6 pt-0">
          {/* Sentinel Controls */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-muted-foreground">Sentinel</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-sm">Sentinel Active</Label>
                  <p className="text-xs text-muted-foreground">Run automated market analysis</p>
                </div>
                <Switch
                  checked={form.crypto_sentinel_enabled === "on"}
                  onCheckedChange={(v) => setForm((s) => ({ ...s, crypto_sentinel_enabled: v ? "on" : "off" }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">Scan Interval (minutes)</Label>
                <Input
                  type="number"
                  min={5}
                  max={1440}
                  value={form.crypto_sentinel_interval}
                  onChange={(e) => setForm((s) => ({ ...s, crypto_sentinel_interval: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5 md:col-span-2">
                <Label className="text-sm">Monitored Coins</Label>
                <Input
                  value={form.crypto_sentinel_coins}
                  onChange={(e) => setForm((s) => ({ ...s, crypto_sentinel_coins: e.target.value }))}
                  placeholder="BTC,ETH,SOL"
                />
                <p className="text-xs text-muted-foreground">Comma-separated symbols</p>
              </div>
            </div>
          </div>

          {/* Trading Controls */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-muted-foreground">Trading</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-sm">Trading Enabled</Label>
                  <p className="text-xs text-muted-foreground">Allow sentinel to execute trades</p>
                </div>
                <Switch
                  checked={form.crypto_trading_enabled === "on"}
                  onCheckedChange={(v) => setForm((s) => ({ ...s, crypto_trading_enabled: v ? "on" : "off" }))}
                />
              </div>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-sm">Auto-Confirm Trades</Label>
                  <p className="text-xs text-muted-foreground">Execute without manual approval</p>
                </div>
                <Switch
                  checked={form.crypto_sentinel_auto_confirm === "on"}
                  onCheckedChange={(v) => setForm((s) => ({ ...s, crypto_sentinel_auto_confirm: v ? "on" : "off" }))}
                />
              </div>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-sm">Sandbox Mode</Label>
                  <p className="text-xs text-muted-foreground">Paper trading (no real money)</p>
                </div>
                <Switch
                  checked={form.crypto_sandbox_mode === "on"}
                  onCheckedChange={(v) => setForm((s) => ({ ...s, crypto_sandbox_mode: v ? "on" : "off" }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">Max Trade Size (USD)</Label>
                <Input
                  type="number"
                  min={1}
                  value={form.crypto_max_trade_usd}
                  onChange={(e) => setForm((s) => ({ ...s, crypto_max_trade_usd: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">Max Trades Per Day</Label>
                <Input
                  type="number"
                  min={1}
                  max={50}
                  value={form.crypto_sentinel_max_trades_per_day}
                  onChange={(e) => setForm((s) => ({ ...s, crypto_sentinel_max_trades_per_day: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">Daily Loss Limit (USD)</Label>
                <Input
                  type="number"
                  min={0}
                  value={form.crypto_sentinel_daily_loss_limit_usd}
                  onChange={(e) => setForm((s) => ({ ...s, crypto_sentinel_daily_loss_limit_usd: e.target.value }))}
                />
              </div>
            </div>
          </div>

          {/* Risk Management */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-muted-foreground">Risk Management</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-sm">Default Stop Loss (%)</Label>
                <Input
                  type="number"
                  min={1}
                  max={50}
                  value={form.crypto_default_stop_loss_pct}
                  onChange={(e) => setForm((s) => ({ ...s, crypto_default_stop_loss_pct: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">Default Take Profit (%)</Label>
                <Input
                  type="number"
                  min={1}
                  max={200}
                  value={form.crypto_default_take_profit_pct}
                  onChange={(e) => setForm((s) => ({ ...s, crypto_default_take_profit_pct: e.target.value }))}
                />
              </div>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-sm">Trailing Stop</Label>
                  <p className="text-xs text-muted-foreground">Lock in profits as price rises</p>
                </div>
                <Switch
                  checked={form.crypto_trailing_stop_enabled === "on"}
                  onCheckedChange={(v) => setForm((s) => ({ ...s, crypto_trailing_stop_enabled: v ? "on" : "off" }))}
                />
              </div>
              {form.crypto_trailing_stop_enabled === "on" && (
                <div className="space-y-1.5">
                  <Label className="text-sm">Trailing Stop Distance (%)</Label>
                  <Input
                    type="number"
                    min={0.5}
                    max={20}
                    step={0.5}
                    value={form.crypto_trailing_stop_pct}
                    onChange={(e) => setForm((s) => ({ ...s, crypto_trailing_stop_pct: e.target.value }))}
                  />
                </div>
              )}
            </div>
          </div>

          {/* CEO Mode */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
              <Crown className="h-3.5 w-3.5 text-amber-500" />
              CEO Mode (Claude Strategic Directives)
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-sm">CEO Mode Enabled</Label>
                  <p className="text-xs text-muted-foreground">Daily strategic briefing via Claude API</p>
                </div>
                <Switch
                  checked={form.crypto_ceo_enabled === "on"}
                  onCheckedChange={(v) => setForm((s) => ({ ...s, crypto_ceo_enabled: v ? "on" : "off" }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">Briefing Hour (0–23)</Label>
                <Input
                  type="number"
                  min={0}
                  max={23}
                  value={form.crypto_ceo_briefing_hour}
                  onChange={(e) => setForm((s) => ({ ...s, crypto_ceo_briefing_hour: e.target.value }))}
                />
                <p className="text-xs text-muted-foreground">Hour of day to run CEO briefing (local time)</p>
              </div>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-sm">Escalation Enabled</Label>
                  <p className="text-xs text-muted-foreground">Allow Sentinel to call CEO off-schedule on big moves</p>
                </div>
                <Switch
                  checked={form.crypto_ceo_escalation_enabled === "on"}
                  onCheckedChange={(v) => setForm((s) => ({ ...s, crypto_ceo_escalation_enabled: v ? "on" : "off" }))}
                />
              </div>
            </div>
          </div>

          {/* Save Button */}
          <div className="flex justify-end">
            <Button
              onClick={() => updateConfig.mutate({ settings: form })}
              disabled={updateConfig.isPending}
              className="gap-2"
            >
              <Save className="h-4 w-4" />
              {updateConfig.isPending ? "Saving..." : "Save Config"}
            </Button>
          </div>
        </CardContent>
      )}
    </Card>
  );
}

function CEODirectiveCard({
  directive,
  onRequestBriefing,
  isBriefing,
  ceoEnabled,
}: {
  directive: any;
  onRequestBriefing: () => void;
  isBriefing: boolean;
  ceoEnabled: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  const isExpired = directive?.validUntil
    ? new Date(directive.validUntil) < new Date()
    : false;
  const biasColor =
    directive?.overallBias === "bullish"
      ? "text-emerald-500"
      : directive?.overallBias === "bearish"
        ? "text-red-500"
        : "text-yellow-500";
  const regimeColor =
    directive?.marketRegime === "risk-on"
      ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/30"
      : directive?.marketRegime === "risk-off"
        ? "bg-red-500/10 text-red-500 border-red-500/30"
        : directive?.marketRegime === "volatile"
          ? "bg-orange-500/10 text-orange-500 border-orange-500/30"
          : "bg-zinc-500/10 text-zinc-400 border-zinc-500/30";

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Crown className="h-4 w-4 text-amber-500" />
              CEO Directive
              {isExpired && directive && (
                <Badge variant="outline" className="text-yellow-500 border-yellow-500/50 text-[10px]">
                  Expired
                </Badge>
              )}
            </CardTitle>
            <CardDescription>
              {directive
                ? `Generated ${formatDistanceToNow(new Date(directive.generatedAt), { addSuffix: true })}`
                : "Strategic direction from Claude"}
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={onRequestBriefing}
            disabled={isBriefing || !ceoEnabled}
            className="gap-1.5"
          >
            {isBriefing ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Briefing...
              </>
            ) : (
              <>
                <Crown className="h-3.5 w-3.5" />
                Request Briefing
              </>
            )}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {!directive ? (
          <div className="text-center py-6">
            <Crown className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">
              {ceoEnabled
                ? "No CEO directive yet. Click \"Request Briefing\" to get strategic guidance."
                : "Enable CEO mode in Agent Management to get daily strategic directives from Claude."}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Top-level badges */}
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline" className={regimeColor}>
                {directive.marketRegime?.replace("-", " ").toUpperCase()}
              </Badge>
              <Badge variant="outline" className={biasColor === "text-emerald-500" ? "text-emerald-500 border-emerald-500/30" : biasColor === "text-red-500" ? "text-red-500 border-red-500/30" : "text-yellow-500 border-yellow-500/30"}>
                {directive.overallBias?.toUpperCase()}
              </Badge>
              <Badge variant="outline">
                Risk: {directive.riskLevel}/10
              </Badge>
              {isExpired && (
                <Badge variant="outline" className="text-yellow-500 border-yellow-500/50">
                  <AlertTriangle className="h-3 w-3 mr-1" />
                  Expired — waiting for next briefing
                </Badge>
              )}
            </div>

            {/* Summary */}
            <p className="text-sm leading-relaxed">{directive.summary}</p>

            {/* Coin guidance */}
            {directive.coins && Object.keys(directive.coins).length > 0 && (
              <div className="space-y-2">
                <span className="text-xs font-medium text-muted-foreground">Coin Guidance</span>
                <div className="grid gap-2">
                  {Object.entries(directive.coins as Record<string, { bias: string; action: string; maxPositionPct: number; notes: string }>).map(
                    ([coin, data]) => (
                      <div key={coin} className="flex items-start gap-3 rounded-lg border p-2.5">
                        <div
                          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
                          style={{ backgroundColor: getCoinColor(coin) }}
                        >
                          {coin.substring(0, 3)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium">{coin}</span>
                            <Badge
                              variant="outline"
                              className={`text-[10px] ${
                                data.bias === "bullish"
                                  ? "text-emerald-500 border-emerald-500/30"
                                  : data.bias === "bearish"
                                    ? "text-red-500 border-red-500/30"
                                    : "text-yellow-500 border-yellow-500/30"
                              }`}
                            >
                              {data.bias}
                            </Badge>
                            <span className="text-[10px] text-muted-foreground">
                              max {data.maxPositionPct}%
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {data.action}
                          </p>
                        </div>
                      </div>
                    )
                  )}
                </div>
              </div>
            )}

            {/* Expandable details */}
            <button
              onClick={() => setExpanded(!expanded)}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              {expanded ? "Less detail" : "More detail"}
            </button>

            {expanded && (
              <div className="space-y-3 pt-1">
                {/* Key levels */}
                {directive.keyLevels && Object.keys(directive.keyLevels).length > 0 && (
                  <div>
                    <span className="text-xs font-medium text-muted-foreground">Key Levels</span>
                    <div className="mt-1 overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b text-muted-foreground">
                            <th className="text-left py-1 pr-3 font-medium">Coin</th>
                            <th className="text-right py-1 pr-3 font-medium">Buy Zone</th>
                            <th className="text-right py-1 font-medium">Sell Zone</th>
                          </tr>
                        </thead>
                        <tbody>
                          {Object.entries(directive.keyLevels as Record<string, { buyZone: [number, number]; sellZone: [number, number] }>).map(
                            ([coin, levels]) => (
                              <tr key={coin} className="border-b border-border/50">
                                <td className="py-1.5 pr-3 font-medium">{coin}</td>
                                <td className="py-1.5 pr-3 text-right text-emerald-500 tabular-nums">
                                  ${levels.buyZone[0].toLocaleString()} – ${levels.buyZone[1].toLocaleString()}
                                </td>
                                <td className="py-1.5 text-right text-red-500 tabular-nums">
                                  ${levels.sellZone[0].toLocaleString()} – ${levels.sellZone[1].toLocaleString()}
                                </td>
                              </tr>
                            )
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Risk guidelines */}
                {directive.riskGuidelines && (
                  <div>
                    <span className="text-xs font-medium text-muted-foreground">Risk Guidelines</span>
                    <p className="text-xs mt-0.5 leading-relaxed">{directive.riskGuidelines}</p>
                  </div>
                )}

                {/* Avoid */}
                {directive.avoid && directive.avoid.length > 0 && (
                  <div>
                    <span className="text-xs font-medium text-muted-foreground">Avoid</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {directive.avoid.map((item: string, i: number) => (
                        <Badge key={i} variant="secondary" className="text-[10px] text-red-400">
                          {item}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Escalation triggers */}
                {directive.escalationTriggers && directive.escalationTriggers.length > 0 && (
                  <div>
                    <span className="text-xs font-medium text-muted-foreground">Escalation Triggers</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {directive.escalationTriggers.map((item: string, i: number) => (
                        <Badge key={i} variant="outline" className="text-[10px]">
                          {item}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Validity */}
                <div className="text-[10px] text-muted-foreground pt-1 border-t">
                  Valid until: {directive.validUntil ? format(new Date(directive.validUntil), "MMM d, HH:mm") : "—"}
                  {" · "}Model: {directive.modelUsed || "Claude"}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function RunHistorySection({ runs }: { runs: any[] | undefined }) {
  const [showHistory, setShowHistory] = useState(false);
  const count = runs?.length ?? 0;

  return (
    <Card>
      <CardHeader
        className="pb-3 cursor-pointer select-none"
        onClick={() => setShowHistory(!showHistory)}
      >
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">Run History</CardTitle>
            <CardDescription>
              {count === 0
                ? "No sentinel runs yet"
                : `${count} recent analyses and decisions`}
            </CardDescription>
          </div>
          <button className="p-1 text-muted-foreground hover:text-foreground transition-colors">
            {showHistory ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </button>
        </div>
      </CardHeader>
      {showHistory && (
        <CardContent className="space-y-2 pt-0">
          {!runs || runs.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No sentinel runs yet
            </p>
          ) : (
            runs.map((run) => <RunCard key={run.id} run={run} />)
          )}
        </CardContent>
      )}
    </Card>
  );
}

function RunCard({ run }: { run: any }) {
  const [expanded, setExpanded] = useState(false);
  const hasError = !!run.error;
  const signals = run.signals as string[] | null;
  const actions = run.actions as { type: string; symbol: string; reason: string }[] | null;

  return (
    <div
      className={`rounded-lg border p-3 transition-colors ${
        hasError ? "border-red-500/50 bg-red-500/5" : "hover:bg-muted/30"
      }`}
    >
      <div
        className="flex items-start justify-between cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs text-muted-foreground">
              {run.createdAt ? formatDistanceToNow(run.createdAt, { addSuffix: true }) : "Unknown"}
            </span>
            {run.durationMs && (
              <span className="text-xs text-muted-foreground">({(run.durationMs / 1000).toFixed(0)}s)</span>
            )}
            {hasError && (
              <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                Error
              </Badge>
            )}
          </div>
          <p className="text-sm leading-relaxed">
            {hasError ? run.error : (run.summary || "No summary").substring(0, 200)}
            {!hasError && run.summary && run.summary.length > 200 ? "..." : ""}
          </p>

          {/* Action badges */}
          {actions && actions.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {actions.map((a, i) => (
                <Badge
                  key={i}
                  variant="outline"
                  className={
                    a.type === "buy"
                      ? "text-emerald-500 border-emerald-500/50"
                      : a.type === "sell"
                        ? "text-red-500 border-red-500/50"
                        : "text-muted-foreground border-border"
                  }
                >
                  {a.type.toUpperCase()} {a.symbol}
                </Badge>
              ))}
            </div>
          )}
        </div>
        <button className="shrink-0 ml-2 p-1 text-muted-foreground hover:text-foreground">
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
      </div>

      {expanded && (
        <div className="mt-3 pt-3 border-t space-y-2">
          {/* Full summary */}
          {run.summary && (
            <div>
              <span className="text-xs font-medium text-muted-foreground">Summary</span>
              <p className="text-sm mt-0.5">{run.summary}</p>
            </div>
          )}

          {/* Signals */}
          {signals && signals.length > 0 && (
            <div>
              <span className="text-xs font-medium text-muted-foreground">Signals</span>
              <div className="flex flex-wrap gap-1 mt-1">
                {signals.map((s, i) => (
                  <Badge key={i} variant="secondary" className="text-xs">
                    {s}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Actions with reasoning */}
          {actions && actions.length > 0 && (
            <div>
              <span className="text-xs font-medium text-muted-foreground">Actions</span>
              <div className="space-y-1 mt-1">
                {actions.map((a, i) => (
                  <div key={i} className="text-sm">
                    <span className={
                      a.type === "buy" ? "text-emerald-500 font-medium" :
                      a.type === "sell" ? "text-red-500 font-medium" :
                      "text-muted-foreground"
                    }>
                      {a.type.toUpperCase()} {a.symbol}
                    </span>
                    {a.reason && <span className="text-muted-foreground"> — {a.reason}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Sentiment breakdown */}
          {run.sentiment && (
            <div>
              <span className="text-xs font-medium text-muted-foreground">Sentiment</span>
              <div className="flex flex-wrap gap-2 mt-1">
                {Object.entries(run.sentiment as Record<string, { score: number; label: string }>).map(([coin, data]) => (
                  <span key={coin} className="text-xs">
                    <span className="font-medium">{coin}:</span>{" "}
                    <span className={
                      data.label === "bullish" ? "text-emerald-500" :
                      data.label === "bearish" ? "text-red-500" :
                      "text-yellow-500"
                    }>
                      {data.label} ({(data.score * 100).toFixed(0)}%)
                    </span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SourceBadge({ source }: { source: string | null }) {
  const config: Record<string, { label: string; className: string }> = {
    sentinel: { label: "Sentinel", className: "text-purple-500 border-purple-500/50" },
    user: { label: "Manual", className: "text-blue-500 border-blue-500/50" },
    stop_loss: { label: "Stop Loss", className: "text-red-500 border-red-500/50" },
    take_profit: { label: "Take Profit", className: "text-emerald-500 border-emerald-500/50" },
  };
  const cfg = config[source || "user"] || config.user;
  return (
    <Badge variant="outline" className={`text-[10px] ${cfg.className}`}>
      {cfg.label}
    </Badge>
  );
}

function PositionCard({ position }: { position: any }) {
  const pnlColor = (position.unrealizedPnl ?? 0) >= 0 ? "text-emerald-500" : "text-red-500";
  const pnlSign = (position.unrealizedPnl ?? 0) >= 0 ? "+" : "";

  return (
    <div className="rounded-lg border p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <CircleDot className="h-4 w-4 text-emerald-500" />
          <span className="font-medium">{position.symbol}</span>
          <Badge variant="outline" className="text-xs">
            {position.side.toUpperCase()}
          </Badge>
        </div>
        {position.currentPrice && (
          <span className={`text-lg font-semibold tabular-nums ${pnlColor}`}>
            {pnlSign}${(position.unrealizedPnl ?? 0).toFixed(2)}
            <span className="text-xs ml-1">
              ({pnlSign}{(position.unrealizedPnlPct ?? 0).toFixed(1)}%)
            </span>
          </span>
        )}
      </div>

      <div className="grid grid-cols-3 gap-4 text-sm">
        <div>
          <span className="text-xs text-muted-foreground">Entry</span>
          <p className="font-medium tabular-nums">${position.entryPrice.toFixed(2)}</p>
        </div>
        <div>
          <span className="text-xs text-muted-foreground">Current</span>
          <p className="font-medium tabular-nums">{position.currentPrice ? `$${position.currentPrice.toFixed(2)}` : "—"}</p>
        </div>
        <div>
          <span className="text-xs text-muted-foreground">Amount</span>
          <p className="font-medium tabular-nums">{position.amount}</p>
        </div>
      </div>

      {/* SL/TP Progress Bars */}
      {(position.stopLoss || position.takeProfit) && (
        <div className="mt-3 space-y-2">
          {position.stopLoss && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-red-500 w-6">SL</span>
              <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-red-500 rounded-full transition-all"
                  style={{
                    width: `${Math.max(0, Math.min(100, 100 - (position.distanceToSL ?? 0) * 10))}%`,
                  }}
                />
              </div>
              <span className="text-xs text-muted-foreground tabular-nums w-20 text-right">
                ${position.stopLoss.toFixed(2)} ({position.distanceToSL?.toFixed(1) ?? "?"}%)
              </span>
            </div>
          )}
          {position.takeProfit && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-emerald-500 w-6">TP</span>
              <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500 rounded-full transition-all"
                  style={{
                    width: `${Math.max(0, Math.min(100, 100 - (position.distanceToTP ?? 0) * 10))}%`,
                  }}
                />
              </div>
              <span className="text-xs text-muted-foreground tabular-nums w-20 text-right">
                ${position.takeProfit.toFixed(2)} ({position.distanceToTP?.toFixed(1) ?? "?"}%)
              </span>
            </div>
          )}
          {position.trailingStopPct && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Shield className="h-3 w-3" />
              Trailing stop: {position.trailingStopPct}% (HWM: ${position.highWaterMark?.toFixed(2) ?? "—"})
            </div>
          )}
        </div>
      )}
    </div>
  );
}
