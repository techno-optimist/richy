import { router } from "./init";
import { settingsRouter } from "./routers/settings";
import { conversationsRouter } from "./routers/conversations";
import { messagesRouter } from "./routers/messages";
import { memoryRouter } from "./routers/memory";
import { toolsRouter } from "./routers/tools";
import { tasksRouter } from "./routers/tasks";
import { cryptoRouter } from "./routers/crypto";

export const appRouter = router({
  settings: settingsRouter,
  conversations: conversationsRouter,
  messages: messagesRouter,
  memory: memoryRouter,
  tools: toolsRouter,
  tasks: tasksRouter,
  crypto: cryptoRouter,
});

export type AppRouter = typeof appRouter;
