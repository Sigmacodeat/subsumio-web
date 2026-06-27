import { createPublicHandler } from "@/lib/api-handler";
import { getStore } from "@/lib/auth/store";
import { verifyActionToken, bindFragment } from "@/lib/auth/tokens";
import { z } from "zod";

const verifySchema = z.object({
  token: z.string(),
});

export const GET = createPublicHandler(
  {
    query: verifySchema,
  },
  async (_req, _body, query) => {
    const { token } = query;
    const payload = await verifyActionToken(token, "verify");
    if (!payload) {
      return Response.redirect(new URL("/login?verify=invalid", process.env.NEXT_PUBLIC_APP_URL || "https://subsum.eu"));
    }

    const store = getStore();
    const user = await store.getById(payload.uid);
    if (!user || (await bindFragment(user.email)) !== payload.bind) {
      return Response.redirect(new URL("/login?verify=invalid", process.env.NEXT_PUBLIC_APP_URL || "https://subsum.eu"));
    }

    if (!user.emailVerifiedAt) {
      await store.update(user.id, { emailVerifiedAt: new Date().toISOString() });
    }
    // Logged-in users land in the app; logged-out users hit the login redirect.
    return Response.redirect(new URL("/dashboard", process.env.NEXT_PUBLIC_APP_URL || "https://subsum.eu"));
  }
);
