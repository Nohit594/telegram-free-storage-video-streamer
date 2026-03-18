export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const targetUrl = url.searchParams.get('url');

    if (!targetUrl) {
      return new Response("Missing 'url' parameter", { status: 400 });
    }

    // CORS Headers
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, HEAD, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      // Create request to Telegram API
      const modifiedRequest = new Request(targetUrl, {
        method: request.method,
        headers: request.headers
      });

      // Avoid passing Cloudflare specific headers to telegram securely
      modifiedRequest.headers.delete("cf-connecting-ip");
      modifiedRequest.headers.delete("cf-ipcountry");
      modifiedRequest.headers.delete("cf-ray");
      modifiedRequest.headers.delete("cf-visitor");
      modifiedRequest.headers.delete("x-forwarded-proto");
      modifiedRequest.headers.delete("x-real-ip");

      const response = await fetch(modifiedRequest);

      // Reconstruct the response adding cache control and CORS
      const newHeaders = new Headers(response.headers);
      newHeaders.set("Access-Control-Allow-Origin", "*");
      
      // Cache the HLS chunk on Cloudflare CDN for 1 year (immutable)
      // Since chunk names are unique, we can safely cache them forever
      newHeaders.set("Cache-Control", "public, max-age=31536000, immutable");

      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: newHeaders
      });

    } catch (e) {
      return new Response("Error fetching target URL: " + e.message, { status: 500, headers: corsHeaders });
    }
  }
};
