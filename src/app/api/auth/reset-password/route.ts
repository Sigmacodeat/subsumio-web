import { getStore } from "@/lib/auth/store";
import { hashPassword } from "@/lib/auth/password";
import { verifyActionToken, bindFragment } from "@/lib/auth/tokens";
import { passwordSchema } from "@/lib/api-validation";
import { revokeAllSessions } from "@/lib/auth/session";

export async function POST(req: Request) {
  try {
    const { token, password: rawPassword } = await req.json();
    const passwordResult = passwordSchema.safeParse(rawPassword);
    if (!token || !passwordResult.success) {
      return Response.json(
        { error: "invalid_input", details: passwordResult.error?.flatten() },
        { status: 400 }
      );
    }
    const password = passwordResult.data;

    const payload = await verifyActionToken(token, "reset");
    if (!payload) {
      return Response.json({ error: "invalid_or_expired_token" }, { status: 400 });
    }

    const store = getStore();
    const user = await store.getById(payload.uid);
    if (!user) {
      return Response.json({ error: "invalid_or_expired_token" }, { status: 400 });
    }

    const currentBind = await bindFragment(user.passwordHash);
    if (currentBind !== payload.bind) {
      return Response.json({ error: "invalid_or_expired_token" }, { status: 400 });
    }

    await store.update(user.id, { passwordHash: await hashPassword(password) });
    await revokeAllSessions(user.id);
    return Response.json({ success: true });
  } catch (err: unknown) {
    console.error("[auth/reset-password]", err instanceof Error ? err.message : String(err));
    return Response.json({ error: "server_error" }, { status: 500 });
  }
}
