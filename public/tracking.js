// public/tracking.js
// Pasted on external landing pages: <script src=".../tracking.js" data-project="educacional"></script>
(function () {
  var SCRIPT = document.currentScript;
  var PROJECT = (SCRIPT && SCRIPT.dataset.project) || "educacional";
  var CHECKOUT_HOSTS = ((SCRIPT && SCRIPT.dataset.checkoutHosts) ||
    "perfectpay.com.br,pay.perfectpay.com.br,cartpanda.com,checkout.cartpanda.com"
  ).split(",").map(function (s) { return s.trim(); }).filter(Boolean);
  var COLLECT_URL = (SCRIPT && SCRIPT.dataset.collectUrl) ||
    "https://lqrlvefeznfaauwgvubl.supabase.co/functions/v1/ad-collect";

  function getCookie(name) {
    try {
      var m = document.cookie.match(new RegExp("(?:^|; )" + name + "=([^;]*)"));
      return m ? decodeURIComponent(m[1]) : null;
    } catch (e) { return null; }
  }
  function setCookie(name, value, days) {
    try {
      var d = new Date();
      d.setTime(d.getTime() + days * 24 * 60 * 60 * 1000);
      document.cookie = name + "=" + encodeURIComponent(value) +
        "; expires=" + d.toUTCString() + "; path=/; SameSite=Lax";
    } catch (e) { /* never break the LP */ }
  }
  function uuidv4() {
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0, v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  var rtVid = getCookie("rt_vid");
  if (!rtVid) {
    rtVid = uuidv4();
    setCookie("rt_vid", rtVid, 30);
  }

  var params = new URLSearchParams(window.location.search);
  var utms = {
    utm_source: params.get("utm_source"),
    utm_medium: params.get("utm_medium"),
    utm_campaign: params.get("utm_campaign"),
    utm_content: params.get("utm_content"),
    utm_term: params.get("utm_term"),
    fbclid: params.get("fbclid"),
  };
  // Persist across the session in case the visitor navigates before checking out
  Object.keys(utms).forEach(function (k) {
    if (utms[k]) setCookie("rt_" + k, utms[k], 30);
    else utms[k] = getCookie("rt_" + k) || undefined;
  });

  var payload = {
    rt_vid: rtVid,
    project: PROJECT,
    utm_source: utms.utm_source || undefined,
    utm_medium: utms.utm_medium || undefined,
    utm_campaign: utms.utm_campaign || undefined,
    utm_content: utms.utm_content || undefined,
    utm_term: utms.utm_term || undefined,
    fbclid: utms.fbclid || undefined,
    fbp: getCookie("_fbp") || undefined,
    fbc: getCookie("_fbc") || undefined,
    landing_url: window.location.href,
    referrer: document.referrer || undefined,
  };

  try {
    var body = JSON.stringify(payload);
    if (navigator.sendBeacon) {
      var blob = new Blob([body], { type: "application/json" });
      navigator.sendBeacon(COLLECT_URL, blob);
    } else {
      fetch(COLLECT_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: body, keepalive: true });
    }
  } catch (e) { /* never break the LP */ }

  function isCheckoutLink(href) {
    try {
      var host = new URL(href, window.location.href).hostname;
      return CHECKOUT_HOSTS.some(function (h) { return host === h || host.endsWith("." + h); });
    } catch (e) { return false; }
  }

  function stampLink(a) {
    if (!a.href || a.dataset.rtStamped) return;
    if (!isCheckoutLink(a.href)) return;
    try {
      var url = new URL(a.href, window.location.href);
      url.searchParams.set("rt_vid", rtVid);
      Object.keys(utms).forEach(function (k) {
        if (utms[k]) url.searchParams.set(k, utms[k]);
      });
      a.href = url.toString();
      a.dataset.rtStamped = "1";
    } catch (e) { /* ignore malformed hrefs */ }
  }

  function stampAll() {
    document.querySelectorAll("a[href]").forEach(stampLink);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", stampAll);
  } else {
    stampAll();
  }

  // Catch links inserted after initial render (page builders often do this)
  new MutationObserver(function () { stampAll(); }).observe(document.documentElement, {
    childList: true, subtree: true,
  });
})();
