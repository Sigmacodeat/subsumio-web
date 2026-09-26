package io.subsum.app;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Hands a received share ("An Subsumio senden") to the web page. The shared
 * text is never put into the page URL — it would end up in server logs and the
 * WebView history. /mobile/share calls consume() and gets (and clears) it.
 */
@CapacitorPlugin(name = "ShareIntent")
public class ShareIntentPlugin extends Plugin {

  private static JSObject pending;

  static synchronized void setPending(JSObject share) {
    pending = share;
  }

  private static synchronized JSObject take() {
    JSObject out = pending;
    pending = null;
    return out;
  }

  @PluginMethod
  public void consume(PluginCall call) {
    JSObject share = take();
    call.resolve(share != null ? share : new JSObject());
  }
}
