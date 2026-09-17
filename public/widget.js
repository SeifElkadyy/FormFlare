(function () {
  var script = document.currentScript;
  if (!script) return;
  var form = script.getAttribute("data-form");
  if (!form) return;
  var src = new URL("/p/" + encodeURIComponent(form), script.src);
  src.searchParams.set("embed", "1");
  var ref = script.getAttribute("data-ref");
  if (ref) src.searchParams.set("ref", ref);
  var iframe = document.createElement("iframe");
  iframe.src = src.href;
  iframe.title = "Form";
  iframe.style.cssText = "border:0;width:100%;min-height:420px;background:transparent;";
  iframe.setAttribute("loading", "lazy");
  script.parentNode.insertBefore(iframe, script);
})();
