import { z } from "zod";
import { generateOAuthUrl } from "corsair/oauth";
import { createTRPCRouter, publicProcedure } from "@/server/api/trpc";
import { corsair, OAUTH_REDIRECT_URI, tenantInput } from "@/server/corsair";
import { PLUGIN_IDS, type TenantConnection } from "@/lib/plugins";
import { TENANTS, tenantMeta, type TenantId } from "@/lib/tenants";

export const authRouter = createTRPCRouter({
  /**
   * Connection state of every account at once, so the switcher can flag an
   * unauthorized account and the dashboard can prompt on switch.
   */
  listStatuses: publicProcedure.query(async () => {
    const entries = await Promise.all(
      TENANTS.map(async (t) => {
        // `manage.tenants.list()` also reports a `connectedPlugins` array, but
        // it counts any account row holding a DEK — a tenant whose consent
        // never completed still looks connected there. connectionStatus checks
        // for a stored access token, which is what actually gates API calls.
        const status = await corsair.manage.connectionStatus.get({
          tenantId: t.id,
        });

        const plugins = PLUGIN_IDS.map((id) => ({
          id,
          state: status[id] ?? "not_connected",
        }));
        const pending = plugins
          .filter((p) => p.state !== "connected")
          .map((p) => p.id);

        return [
          t.id,
          { plugins, pending, connected: pending.length === 0 },
        ] as const;
      }),
    );

    return Object.fromEntries(entries) as Record<TenantId, TenantConnection>;
  }),

  /**
   * Authorization URL for one (account, plugin) pair. The caller navigates to
   * it; Google returns to `/oauth/callback`, which finishes the exchange.
   */
  getConnectUrl: publicProcedure
    .input(tenantInput.extend({ plugin: z.enum(PLUGIN_IDS) }))
    .mutation(async ({ input }) => {
      try {
        const { url } = await generateOAuthUrl(corsair, input.plugin, {
          tenantId: input.tenant,
          redirectUri: OAUTH_REDIRECT_URI,
        });

        // Both plugins ship `prompt=consent` in their own authParams, which
        // lets Google silently reuse whichever account is already signed in.
        // Connecting a *second* account that way files its tokens under this
        // tenant and looks like working auth while serving the wrong mailbox.
        // `select_account` forces the chooser; `login_hint` preselects the
        // address this tenant is supposed to hold.
        const authorize = new URL(url);
        authorize.searchParams.set("prompt", "select_account consent");
        authorize.searchParams.set("login_hint", tenantMeta(input.tenant).email);

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
