/**
 * Android "send to Subsumio": the shared text and file reference come from
 * the native `ShareIntent` plugin, never from the URL — shared e-mail or chat
 * content must not end up in request URLs (and therefore server logs or the
 * WebView history).
 */
import { UPLOAD_ACCEPT, isSupportedUploadName } from "@/lib/upload-formats";

export interface PendingShare {
  text?: string;
  subject?: string;
  /** content:// URI of a shared file, read via the Filesystem plugin. */
  stream?: string;
  /** Display name from the content provider (may lack an extension). */
  name?: string;
  /** MIME type reported by the content provider. */
  mimeType?: string;
}

interface ShareIntentPlugin {
  consume(): Promise<PendingShare>;
}

/** Takes (and clears) the share the native app received. Null outside the app. */
export async function consumePendingShare(): Promise<PendingShare | null> {
  try {
    const core = await import("@capacitor/core");
    const Cap = core.Capacitor;
    if (!Cap?.isNativePlatform() || !Cap.isPluginAvailable("ShareIntent")) return null;
    const plugin = core.registerPlugin<ShareIntentPlugin>("ShareIntent");
    const pending = await plugin.consume();
    return pending && (pending.text || pending.stream) ? pending : null;
  } catch {
    return null;
  }
}

/**
 * A usable upload name: content URIs often end in a bare id (…/media/1234);
 * without an extension the upload is refused. The provider's MIME type
 * supplies the extension.
 */
export function shareFileName(name: string | undefined, mimeType: string | undefined): string {
  const base = (name ?? "").trim() || "geteilte-datei";
  if (isSupportedUploadName(base)) return base;
  const ext = mimeType ? UPLOAD_ACCEPT[mimeType.toLowerCase()]?.[0] : undefined;
  return ext && mimeType !== "application/octet-stream" ? `${base}${ext}` : base;
}
