(function () {
  var script = document.currentScript;
  if (!script) return;
  var form = script.getAttribute("data-form");
  if (!form) return;
  var src = new URL("/p/" + encodeURIComponent(form), script.src);
  src.searchParams.set("embed", "1");
  var ref = script.getAttribute("data-ref");
  // A ?ref= on the host page (a shared referral link) wins over nothing.
  if (!ref) ref = new URLSearchParams(location.search).get("ref");
  if (ref) src.searchParams.set("ref", ref);
  var iframe = document.createElement("iframe");
  iframe.src = src.href;
  iframe.title = script.getAttribute("data-title") || "Form";
  iframe.style.cssText = "border:0;width:100%;height:420px;background:transparent;display:block;";
  iframe.setAttribute("loading", "lazy");
  script.parentNode.insertBefore(iframe, script);

  // The framed page reports its height (src/components/frame-height.tsx). Only trust
  // messages from this iframe and this instance, so several widgets can share a page.
  window.addEventListener("message", function (event) {
    if (event.source !== iframe.contentWindow || event.origin !== src.origin) return;
    var data = event.data;
    if (!data || data.type !== "formflare:height" || typeof data.height !== "number") return;
    iframe.style.height = Math.max(120, Math.min(data.height, 4000)) + "px";
  });
})();
