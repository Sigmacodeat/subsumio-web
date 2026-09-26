package io.subsum.app;

import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.os.Bundle;
import android.provider.OpenableColumns;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.JSObject;

public class MainActivity extends BridgeActivity {

  @Override
  protected void onCreate(Bundle savedInstanceState) {
    registerPlugin(ShareIntentPlugin.class);
    super.onCreate(savedInstanceState);
    handleShareIntent(getIntent(), true);
  }

  @Override
  protected void onNewIntent(Intent intent) {
    super.onNewIntent(intent);
    handleShareIntent(intent, false);
  }

  /**
   * „An Subsumio senden" (Android Share-Sheet): der geteilte Inhalt wird im
   * ShareIntent-Plugin abgelegt und /mobile/share geöffnet — ohne Inhalt in
   * der URL (keine Mandantendaten in Server-Logs oder im WebView-Verlauf).
   * Die Seite holt Text bzw. Datei-Referenz über ShareIntent.consume().
   */
  private void handleShareIntent(Intent intent, boolean coldStart) {
    if (intent == null || !Intent.ACTION_SEND.equals(intent.getAction())) return;
    String text = intent.getStringExtra(Intent.EXTRA_TEXT);
    String subject = intent.getStringExtra(Intent.EXTRA_SUBJECT);
    Uri stream = intent.getParcelableExtra(Intent.EXTRA_STREAM);
    if (text == null && stream == null) return;

    JSObject share = new JSObject();
    if (subject != null) share.put("subject", subject);
    if (text != null) share.put("text", text);
    if (stream != null) {
      share.put("stream", stream.toString());
      String name = displayName(stream);
      if (name != null) share.put("name", name);
      String mime = getContentResolver().getType(stream);
      if (mime == null) mime = intent.getType();
      if (mime != null) share.put("mimeType", mime);
    }
    ShareIntentPlugin.setPending(share);

    // Bei Kaltstart ist die Bridge noch nicht fertig geladen — kurz verzögern,
    // sonst überschreibt der initiale server.url-Load die Share-Navigation.
    long delay = coldStart ? 900 : 0;
    if (getBridge() != null && getBridge().getWebView() != null) {
      getBridge()
          .getWebView()
          .postDelayed(
              () -> getBridge().getWebView().loadUrl(getBridge().getServerUrl() + "/mobile/share"),
              delay);
    }
  }

  /** The file's display name from the content provider (content:// has no usable path). */
  private String displayName(Uri uri) {
    try (Cursor cursor =
        getContentResolver().query(uri, new String[] {OpenableColumns.DISPLAY_NAME}, null, null, null)) {
      if (cursor != null && cursor.moveToFirst()) {
        int idx = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME);
        if (idx >= 0) return cursor.getString(idx);
      }
    } catch (Exception e) {
      // fall through to the path segment
    }
    try {
      return uri.getLastPathSegment();
    } catch (Exception e) {
      return null;
    }
  }
}
