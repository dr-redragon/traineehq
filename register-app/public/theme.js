// Light or dark, applied before first paint so the page never flashes the
// wrong one. It follows the device; there is no in-app switch. A file rather
// than an inline script so the content security policy can forbid inline
// script altogether. `scheme-ink` is the near-mono accent the app is drawn in.
(function () {
  var root = document.documentElement;
  root.classList.add("scheme-ink");
  try {
    var mq = window.matchMedia("(prefers-color-scheme: dark)");
    var apply = function () {
      root.classList.toggle("dark", mq.matches);
      root.style.colorScheme = mq.matches ? "dark" : "light";
    };
    apply();
    mq.addEventListener("change", apply);
  } catch (e) { /* no matchMedia: light stands */ }
})();
