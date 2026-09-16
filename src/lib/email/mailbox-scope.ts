import { supportMailboxBrainId, type MailboxScope } from "@/lib/email/mailbox";
import { isOpsHost, isPlatformOperator } from "@/lib/auth/platform-operator";

export { supportMailboxBrainId };

/**
 * Mailbox scope for a request.
 *
 * Firm users see their firm brain's mail (ctx.brainId resolves the org brain
 * for members). A platform operator working on the ops host sees the support
 * mailbox instead — never another firm's mail.
 */
export function mailboxScopeFor(
  ctx: {
    brainId: string;
    user: {
      id: string;
      email?: string | null;
      twoFactorEnabled?: boolean | null;
      deactivatedAt?: string | null;
    };
  },
  req?: { headers: Headers }
): MailboxScope {
  const onOpsHost = req ? isOpsHost(req.headers.get("host")) : false;
  if (onOpsHost && isPlatformOperator(ctx.user)) {
    return { userId: ctx.user.id, brainId: supportMailboxBrainId() };
  }
  return { userId: ctx.user.id, brainId: ctx.brainId };
}
