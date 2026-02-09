export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { ensureDatabase } = await import("./server/db/migrate");
    ensureDatabase();

    // Start autonomous systems after a delay for server warmup
    setTimeout(async () => {
      try {
        const { startTaskScheduler } = await import(
          "./server/tasks/scheduler"
        );

        // Start Telegram polling (preferred)
        const { startTelegramPolling } = await import(
          "./server/telegram/polling"
        );
        await startTelegramPolling();

        // Start iMessage polling as fallback
        const { startIMessagePolling } = await import(
          "./server/imessage/polling"
        );
        await startIMessagePolling();

        startTaskScheduler();

        // Start crypto sentinel
        const { startCryptoSentinel } = await import(
          "./server/crypto/sentinel"
        );
        await startCryptoSentinel();

        // Start guardian (SL/TP enforcement)
        const { startGuardian } = await import(
          "./server/crypto/guardian"
        );
        await startGuardian();

        // Start CEO scheduler (daily Claude strategic briefing)
        const { startCEOScheduler } = await import(
          "./server/crypto/ceo"
        );
        await startCEOScheduler();

        console.log("[Richy] Autonomous systems initialized");
      } catch (error: any) {
        console.error(
          "[Richy] Failed to start autonomous systems:",
          error.message
        );
      }
    }, 3000);
  }
}
