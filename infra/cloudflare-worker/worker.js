// GamFix API reverse proxy.
//
// Architecture: VPS = backend API (PocketBase + nginx), Cloudflare Pages =
// React frontends. This Worker gives the backend a real hostname
// (api.pocketsoftware.dev) instead of the 15.224.0.22.sslip.io address and
// hides the origin IP. It forwards every request to the VPS over HTTPS with
// the same path/query/method/body and streams the response back (SSE
// /api/realtime included).
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url)
    const origin = new URL(env.ORIGIN_URL || "https://15.224.0.22.sslip.io")
    const upstream = new URL(request.url)
    upstream.protocol = origin.protocol
    upstream.hostname = origin.hostname
    upstream.port = origin.port

    const headers = new Headers(request.headers)
    // Pass the original Host through so nginx picks the backend vhost and the
    // hooks' absolute file-URL builder emits the real domain. TLS/SNI still
    // matches ORIGIN_URL, which holds a valid Let's Encrypt certificate.
    headers.set("Host", url.hostname)
    headers.set("X-Forwarded-Host", url.hostname)
    headers.set("X-Forwarded-Proto", "https")

    const init = {
      method: request.method,
      headers,
      redirect: "manual",
    }
    if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) {
      init.body = request.body
      init.duplex = "half"
    }

    let response
    try {
      response = await fetch(upstream.toString(), init)
    } catch (err) {
      return new Response(JSON.stringify({ error: "upstream_unreachable" }), {
        status: 502,
        headers: { "Content-Type": "application/json" },
      })
    }

    // Return the origin Response object itself: rebuilding it from
    // response.body re-streams an already-decompressed body while the
    // Content-Encoding header survives, which makes response.json() hang in
    // browsers. Passing the original Response keeps encoding semantics intact.
    return response
  },
}
