(function () {
  try {
    var t =
      localStorage.getItem("subsumio-theme") ||
      (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    var r = document.querySelector("[data-app='dashboard']");
    if (r) r.setAttribute("data-theme", t);
  } catch (_e) {}
})();
