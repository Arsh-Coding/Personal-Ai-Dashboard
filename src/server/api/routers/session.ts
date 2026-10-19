import { createTRPCRouter, publicProcedure } from "@/server/api/trpc";

/**
 * Who is signed in.
 *
 * This replaced a `select` mutation that let the caller choose which account the
 * session acted as. That made sense when the only user owned all three accounts;
 * it is exactly the wrong shape once anyone can sign in, so switching is now done
 * by signing out and back in as a different Google account.
 */
export const sessionRouter = createTRPCRouter({
  /** `null` when not signed in — the only procedure that answers unauthenticated. */
  me: publicProcedure.query(({ ctx }) => {
    if (!ctx.user) return null;
    return {
      tenant: ctx.user.id,
      email: ctx.user.email,
      name: ctx.user.name,
      image: ctx.user.image,
    };
  }),
});
