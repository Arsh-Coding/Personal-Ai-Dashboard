import { authRouter } from "@/server/api/routers/auth";
import { calendarRouter } from "@/server/api/routers/calendar";
import { mailRouter } from "@/server/api/routers/mail";
import { meetRouter } from "@/server/api/routers/meet";
import { notesRouter } from "@/server/api/routers/notes";
import { sessionRouter } from "@/server/api/routers/session";
import { createCallerFactory, createTRPCRouter } from "@/server/api/trpc";

export const appRouter = createTRPCRouter({
  auth: authRouter,
  calendar: calendarRouter,
  mail: mailRouter,
  meet: meetRouter,
  notes: notesRouter,
  session: sessionRouter,
});

export type AppRouter = typeof appRouter;
export const createCaller = createCallerFactory(appRouter);
