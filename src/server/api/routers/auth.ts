import { z } from "zod";
import { generateOAuthUrl } from "corsair/oauth";
import { createTRPCRouter, tenantProcedure } from "@/server/api/trpc";
import { corsair, oauthRedirectUri } from "@/server/corsair";
import { PLUGIN_IDS, type TenantConnection } from "@/lib/plugins";
import { probeConnection } from "@/server/authHealth";

export const authRouter = createTRPCRouter({
  /**
   * Connection state of the signed-in account's plugins.
   *
   * This used to iterate a hardcoded list and return every tenant's state at once,
   * for the account switcher. That is a cross-user disclosure now — it would tell
   * any visitor which other accounts exist and whether they are connected — so it
   * reports only the caller's own tenant.
   */
  myStatus: tenantProcedure.query(async ({ ctx }): Promise<TenantConnection> => {
    /**
     * `probeConnection` decides each plugin's state on its own, in parallel.
     *
     * There used to be a `corsair.manage.connectionStatus.get()` call first, used
     * to decide which plugins were worth probing. It was redundant: `connectionStatus`
     * only reports whether an access token was ever *stored*, and `probeConnection`
     * already distinguishes all four states from the stored keys —
     * `not_connected` when there is no refresh token, `missing_credentials` when the
     * app's client id or secret is unset, `needs_reauth` when Google rejects the
     * refresh, and `connected` otherwise.
     *
     * Measured, that call alone cost 5.2 seconds of the endpoint's 17, which is why
     * it is gone. A probe is cheap by comparison and usually makes no network call
     * at all: a cached access token with time left on it is proof enough.
     */
    const plugins = await Promise.all(
      PLUGIN_IDS.map(async (id) => ({
        id,
        state: await probeConnection(ctx.tenantId, id),
      })),
    );
    const pending = plugins
      .filter((p) => p.state !== "connected")
      .map((p) => p.id);

    return { plugins, pending, connected: pending.length === 0 };
  }),

  /**
   * Authorization URL for one (account, plugin) pair. The caller navigates to
   * it; Google returns to `/oauth/callback`, which finishes the exchange.
   */
  getConnectUrl: tenantProcedure
    .input(z.object({ plugin: z.enum(PLUGIN_IDS) }))
    .mutation(async ({ ctx, input }) => {
      try {
        const { url } = await generateOAuthUrl(corsair, input.plugin, {
          tenantId: ctx.tenantId,
          redirectUri: oauthRedirectUri(),
        });

        // Both plugins ship `prompt=consent` in their own authParams, which
        // lets Google silently reuse whichever account is already signed in.
        // Connecting a *second* account that way files its tokens under this
        // tenant and looks like working auth while serving the wrong mailbox.
        // `select_account` forces the chooser; `login_hint` preselects the
        // address this tenant is supposed to hold.
        const authorize = new URL(url);
        authorize.searchParams.set("prompt", "select_account consent");
        // The address this tenant is supposed to hold, straight from the session
        // rather than a hardcoded table.
        authorize.searchParams.set("login_hint", ctx.user.email);

        return { success: true as const, url: authorize.toString() };
      } catch (e: any) {
        console.error("Failed to build Corsair OAuth URL:", e);
        return {
          success: false as const,
          error: e?.message || "Failed to start authorization",
        };
      }
    }),
});
