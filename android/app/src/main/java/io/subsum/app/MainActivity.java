package io.subsum.app;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;

public class MainActivity extends BridgeActivity {

  @Override
  protected void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    handleShareIntent(getIntent(), true);
  }

  @Override
  protected void onNewIntent(Intent intent) {
    super.onNewIntent(intent);
    handleShareIntent(intent, false);
  }

  /**
   * „An Subsumio senden" (Android Share-Sheet): eingehende Shares werden als
   * Query-Parameter auf /mobile/share gelenkt. Text landet als Notiz-Entwurf,
   * Datei-Streams (content://) liest die Web-Seite via @capacitor/filesystem.
   */
  private void handleShareIntent(Intent intent, boolean coldStart) {
    if (intent == null || !Intent.ACTION_SEND.equals(intent.getAction())) return;
    String text = intent.getStringExtra(Intent.EXTRA_TEXT);
    String subject = intent.getStringExtra(Intent.EXTRA_SUBJECT);
    Uri stream = intent.getParcelableExtra(Intent.EXTRA_STREAM);
    if (text == null && stream == null) return;

    StringBuilder path = new StringBuilder("/mobile/share?");
    try {
      if (subject != null)
        path.append("subject=").append(URLEncoder.encode(subject, "UTF-8")).append('&');
      if (text != null)
        path.append("text=").append(URLEncoder.encode(text, "UTF-8")).append('&');
      if (stream != null) {
        String name = getLastPathSegment(stream);
        path.append("stream=").append(URLEncoder.encode(stream.toString(), "UTF-8"));
        if (name != null) path.append("&name=").append(URLEncoder.encode(name, "UTF-8"));
      }
    } catch (Exception e) {
      return;
    }

    // Bei Kaltstart ist die Bridge noch nicht fertig geladen — kurz verzögern,
    // sonst überschreibt der initiale server.url-Load die Share-Navigation.
    long delay = coldStart ? 900 : 0;
    final String target = path.toString();
    if (getBridge() != null && getBridge().getWebView() != null) {
      getBridge()
          .getWebView()
          .postDelayed(
              () -> getBridge().getWebView().loadUrl(getBridge().getServerUrl() + target),
              delay);
    }
  }

  private String getLastPathSegment(Uri uri) {
    try {
      String seg = uri.getLastPathSegment();
      return seg;
    } catch (Exception e) {
      return null;
    }
  }
}
