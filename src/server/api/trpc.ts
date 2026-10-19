import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { ZodError } from "zod";
import { db } from "@/server/db";
import { readSessionUserId } from "@/server/session";
import { findUserById, type AppUser } from "@/server/users";

/**
 * Per-request context.
 *
 * The signed-in user is resolved here, once, from the signed session cookie. No
 * procedure takes an account as input, so none can be pointed at somebody else's
 * data. A missing or tampered cookie yields `user: null` rather than a default,
 * which makes every tenant-scoped procedure fail closed.
 *
 * The session is looked up against `app_user` rather than trusted on its face:
 * a signature only proves the cookie was issued by us, not that the account still
 * exists. A deleted user's session stops working immediately.
 */
export const createTRPCContext = async (opts: { headers: Headers }) => {
  const userId = readSessionUserId(opts.headers.get("cookie"));
  const user: AppUser | null = userId ? await findUserById(userId) : null;

  return {
    db,
    user,
    ...opts,
  };
};

const t = initTRPC.context<typeof createTRPCContext>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError:
          error.cause instanceof ZodError ? error.cause.flatten() : null,
      },
    };
  },
});

export const createCallerFactory = t.createCallerFactory;
export const createTRPCRouter = t.router;

/** Open to anyone: used only for "am I signed in?". */
export const publicProcedure = t.procedure;

/**
 * Requires a signed-in user, and scopes everything to their own tenant.
 *
 * `ctx.tenantId` is the user's own row id — there is no way to ask for a different
 * one, because nothing accepts one. Use this for every procedure that touches
 * Google data or notes; a new endpoint that forgets to is a type error, since
 * `ctx.tenantId` simply does not exist on `publicProcedure`.
 */
export const tenantProcedure = t.procedure.use(async ({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Sign in to continue.",
    });
  }
  return next({
    ctx: { ...ctx, user: ctx.user, tenantId: ctx.user.id },
  });
});
