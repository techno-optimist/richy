"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { nanoid } from "nanoid";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { MobileNav } from "@/components/layout/mobile-nav";
import { CommandPalette } from "@/components/layout/command-palette";

// ─── Auth Gate ─────────────────────────────────────────────────────
// Blocks the app until the user enters the auth token printed on server startup.
// Token is stored in localStorage as `richy_auth_token`.

function AuthGate({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<"checking" | "locked" | "ok">("checking");
  const [tokenInput, setTokenInput] = useState("");
  const [error, setError] = useState("");

  // Validate a token against the server's public checkToken endpoint
  const validateToken = useCallback(async (token: string): Promise<boolean> => {
    try {
      const res = await fetch("/api/trpc/settings.checkToken", {
        headers: { "x-auth-token": token },
      });
      if (!res.ok) return false;
      const json = await res.json();
      // tRPC returns { result: { data: { json: { valid: true } } } }
      return json?.result?.data?.json?.valid === true;
    } catch {
      return false;
    }
  }, []);

  // On mount, check if we already have a valid token
  useEffect(() => {
    const stored = localStorage.getItem("richy_auth_token");
    if (!stored) {
      setState("locked");
      return;
    }
    validateToken(stored).then((valid) => {
      if (valid) {
        setState("ok");
      } else {
        localStorage.removeItem("richy_auth_token");
        setState("locked");
      }
    });
  }, [validateToken]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const trimmed = tokenInput.trim();
      if (!trimmed) {
        setError("Please enter a token");
        return;
      }
      setError("");

      const valid = await validateToken(trimmed);
      if (valid) {
        localStorage.setItem("richy_auth_token", trimmed);
        setState("ok");
      } else {
        setError("Invalid token. Check the server console output.");
      }
    },
    [tokenInput, validateToken]
  );

  if (state === "checking") {
    return (
      <div className="flex h-dvh items-center justify-center bg-background">
        <div className="text-muted-foreground text-sm animate-pulse">
          Authenticating...
        </div>
      </div>
    );
  }

  if (state === "locked") {
    return (
      <div className="flex h-dvh items-center justify-center bg-background p-4">
        <div className="w-full max-w-sm space-y-4">
          <div className="text-center space-y-2">
            <div className="text-3xl">🔐</div>
            <h1 className="text-xl font-semibold">Richy Dashboard</h1>
            <p className="text-sm text-muted-foreground">
              Enter the auth token from your server console to continue.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3">
            <input
              type="password"
              value={tokenInput}
              onChange={(e) => setTokenInput(e.target.value)}
              placeholder="Paste auth token..."
              autoFocus
              className="w-full rounded-lg border border-border bg-muted/50 px-3 py-2.5 text-sm font-mono placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            />
            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}
            <button
              type="submit"
              className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              Unlock
            </button>
          </form>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

// ─── App Layout ────────────────────────────────────────────────────

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  // Global keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd+N / Ctrl+N — new chat
      if (e.key === "n" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        router.push(`/chat/${nanoid()}`);
      }
      // Cmd+, / Ctrl+, — settings
      if (e.key === "," && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        router.push("/settings");
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [router]);

  return (
    <AuthGate>
      <div className="flex h-dvh overflow-hidden">
        <CommandPalette />

        {/* Desktop sidebar */}
        <div className="hidden md:flex">
          <Sidebar />
        </div>

        {/* Main content */}
        <div className="flex flex-1 flex-col overflow-hidden">
          <Topbar />
          <main className="flex-1 overflow-hidden">{children}</main>
          <MobileNav />
        </div>
      </div>
    </AuthGate>
  );
}
