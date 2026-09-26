/**
 * Dashboard theme bootstrap.
 *
 * Rendered as an inline `<script>` at the top of the dashboard shell so the
 * stored theme (or the OS preference) is applied to the `[data-app='dashboard']`
 * node while the HTML is still being parsed — before React hydrates and before
 * the first paint. Without it, a dark-mode user sees a light frame flash.
 *
 * Kept as a string constant (not a public/ file) so it can carry the per-request
 * CSP nonce and so the logic is unit-testable.
 */
export const THEME_STORAGE_KEY = "subsumio-theme";

export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY
)})||(matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light");var d=document.documentElement;d.setAttribute("data-app","dashboard");d.setAttribute("data-theme",t);var rs=d.querySelectorAll("[data-app='dashboard']");for(var i=0;i<rs.length;i++)rs[i].setAttribute("data-theme",t);}catch(_e){}})();`;

/**
 * Darstellungs-/Barrierefreiheits-Bootstrap (Schriftgröße, Kontrast,
 * Bewegung). Läuft im `<head>` des Root-Layouts — also auf Marketing- und
 * Dashboard-Seiten — und setzt `data-font-scale`, `data-contrast` und
 * `data-motion` auf `<html>`, bevor der erste Frame gemalt wird. Muss mit
 * `parseA11yPrefs`/`applyA11yPrefs` in src/lib/a11y-preferences.ts
 * übereinstimmen (gemeinsamer Storage-Key, gleiche Attributwerte).
 */
export const A11Y_STORAGE_KEY = "subsumio-a11y-prefs";

export const A11Y_INIT_SCRIPT = `(function(){try{var r=JSON.parse(localStorage.getItem(${JSON.stringify(
  A11Y_STORAGE_KEY
)})||"null")||{};var d=document.documentElement;var f=String(r.fontScale||"");if(f==="112"||f==="125")d.setAttribute("data-font-scale",f);else d.removeAttribute("data-font-scale");if(r.contrast==="high")d.setAttribute("data-contrast","high");else d.removeAttribute("data-contrast");if(r.motion==="reduce"||r.motion==="allow")d.setAttribute("data-motion",r.motion);else d.removeAttribute("data-motion");}catch(_e){}})();`;
