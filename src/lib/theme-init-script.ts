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
