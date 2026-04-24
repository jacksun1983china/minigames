import { systemRouter } from "./_core/systemRouter";
import { router } from "./_core/trpc";
import { tenantRouter } from "./routers/tenant";
import { gameRouter } from "./routers/game";
import { authRouter } from "./routers/auth";

export const appRouter = router({
  system: systemRouter,
  auth: authRouter,
  /** Multi-tenant management: create tenant, manage API keys, RTP configs, stats */
  tenant: tenantRouter,
  /** Game catalog, session lifecycle, round play */
  game: gameRouter,
});
export type AppRouter = typeof appRouter;
