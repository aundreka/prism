// supabase/functions/meta_web_close/index.ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

/** Whitelist allowed custom schemes to prevent open redirects */
const ALLOWED_SCHEMES = new Set(["prism", "exp"]);

/** Very small HTML escaper for error text */
function esc(s: string) {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!)
  );
}

/** Try to produce an Android intent for exp:// */
function expToAndroidIntent(u: string) {
  try {
    if (!u.startsWith("exp://")) return null;
    const noScheme = u.replace(/^exp:\/\//, "");
    return `intent://${noScheme}#Intent;scheme=exp;package=host.exp.exponent;end`;
  } catch {
    return null;
  }
}

/** Strictly parse and validate a target URL against allowed schemes */
function parseTarget(raw: string | null): { target: string; scheme: string } {
  const fallback = "prism://oauth/callback";
  const t = (raw ?? fallback).trim();

  // Must look like <scheme>://...
  const m = /^([a-zA-Z][a-zA-Z0-9+.-]*):\/\/\S+$/.exec(t);
  if (!m) return { target: fallback, scheme: "prism" };

  const scheme = m[1].toLowerCase();
  if (!ALLOWED_SCHEMES.has(scheme)) {
    return { target: fallback, scheme: "prism" };
  }
  return { target: t, scheme };
}

/** Fallback HTML with multiple client-side strategies */
function htmlResponse(body: string) {
  return new Response(body, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "no-store, max-age=0",
      "Content-Security-Policy":
        "default-src 'self'; script-src 'unsafe-inline' 'self'; style-src 'unsafe-inline' 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none';",
    },
  });
}

Deno.serve((req) => {
  const url = new URL(req.url);
  const rawError = url.searchParams.get("error");
  const { target, scheme } = parseTarget(url.searchParams.get("target"));

  const error = rawError ? `Error: ${esc(rawError)}` : "";
  const androidIntent = scheme === "exp" ? expToAndroidIntent(target) : null;

  /**
   * Strategy:
   * - Return a 200 HTML page (NOT a 302) so Safari / FB webview don't
   *   try to "open" the custom scheme as a normal URL and show an error.
   * - Use JS + optional Android intent + hidden iframe to trigger the deep link.
   * - Your auth session / in-app browser should auto-close when it sees
   *   navigation to prism://... (or exp://...).
   */
  const page = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Returning to App…</title>
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <!-- Meta refresh kept, but this is now on a 200 page, not a 302 -->
  <meta http-equiv="refresh" content="0; url=${esc(target)}">
  <style>
    :root{color-scheme:light dark}
    body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;margin:0;padding:24px;background:#fff;color:#0f172a}
    @media (prefers-color-scheme: dark){
      body{background:#0b0f19;color:#e5e7eb}
      .card{border-color:#273043}
      .btn{background:#2563eb}
      code{background:#111827;color:#e5e7eb}
    }
    .card{max-width:520px;margin:40px auto;padding:20px;border:1px solid #e5e7eb;border-radius:16px}
    .muted{color:#6b7280}
    .btn{display:inline-block;margin-top:12px;padding:10px 14px;border-radius:12px;background:#111827;color:#fff;text-decoration:none}
    .small{font-size:12px}
    code{background:#f3f4f6;padding:2px 6px;border-radius:6px}
  </style>
</head>
<body>
  <div class="card">
    <h2>${error ? "Unable to complete sign-in" : "Connecting…"}</h2>
    ${
      error
        ? `<p class="muted"><code>${error}</code></p>`
        : `<p class="muted">We're returning you to the app now.</p>`
    }
    <p class="small muted">If nothing happens, tap this:</p>
    <p><a class="btn" id="open" href="${esc(target)}">Open App</a></p>
  </div>

  <script>
    (function(){
      var target = ${JSON.stringify(target)};

      // 0) If we're inside a React Native WebView, signal the app to close
      try {
        if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: "oauth_complete", target: target }));
        }
      } catch (e) {}

      // 1) Immediate replace
      try { window.location.replace(target); } catch(e) {}

      // 2) Fallback push after a tick
      setTimeout(function(){
        try { window.location.href = target; } catch(e) {}
      }, 250);

      // 3) Android intent for Expo if needed
      ${
        androidIntent
          ? `setTimeout(function(){ try { window.location.href = ${JSON.stringify(
              androidIntent,
            )}; } catch(e) {} }, 650);`
          : ""
      }

      // 4) Hidden iframe trick (older WebViews / Safari)
      setTimeout(function(){
        try {
          var ifr = document.createElement('iframe');
          ifr.style.display='none';
          ifr.src = target;
          document.body.appendChild(ifr);
        } catch(e) {}
      }, 1000);

      // 5) As a final fallback, try to close the window (works in some WebViews)
      setTimeout(function(){
        try { window.close(); } catch (e) {}
      }, 1500);
    })();
  </script>
</body>
</html>`;

  // IMPORTANT CHANGE:
  // We no longer send a 302 Location to the custom scheme.
  // Just return the HTML page and let JS / meta-refresh handle it.
  return htmlResponse(page);
});
