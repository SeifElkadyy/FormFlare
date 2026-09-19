import { BRAND } from "../brand";
import { publicCount } from "../waitlist/rank";

function cors(request: Request): Record<string, string> {
  const origin = request.headers.get("origin");
  return {
    "Access-Control-Allow-Origin": origin ?? "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Accept",
    Vary: "Origin",
  };
}

export async function handlePublicCount(
  request: Request,
  env: CloudflareEnv,
  publicId: string,
): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: { ...cors(request), "Access-Control-Max-Age": "86400" } });
  }
  if (request.method !== "GET") {
    return Response.json({ ok: false, code: "method_not_allowed" }, { status: 405, headers: cors(request) });
  }

  const count = await publicCount(env.DB, publicId);
  if (count === null) {
    return Response.json({ ok: false, code: "form_not_found" }, { status: 404, headers: cors(request) });
  }

  return Response.json(
    { ok: true, count },
    { headers: { ...cors(request), "Cache-Control": "public, max-age=30" } },
  );
}

export async function handlePublicBadge(
  request: Request,
  env: CloudflareEnv,
  publicId: string,
): Promise<Response> {
  if (request.method !== "GET") {
    return new Response("Method not allowed", { status: 405 });
  }

  const count = await publicCount(env.DB, publicId);
  if (count === null) return new Response("Not found", { status: 404 });

  const label = "waitlist";
  const value = String(count);
  const labelWidth = 64;
  const valueWidth = 12 + value.length * 7;
  const width = labelWidth + valueWidth;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="20" role="img" aria-label="${label}: ${value}">
  <title>${label}: ${value}</title>
  <rect width="${labelWidth}" height="20" fill="${BRAND.colors.ink}"/>
  <rect x="${labelWidth}" width="${valueWidth}" height="20" fill="${BRAND.colors.flare}"/>
  <g text-anchor="middle" font-family="Verdana,DejaVu Sans,sans-serif" font-size="11">
    <text x="${labelWidth / 2}" y="14" fill="${BRAND.colors.mist}">${label}</text>
    <text x="${labelWidth + valueWidth / 2}" y="14" fill="${BRAND.colors.ink}">${value}</text>
  </g>
</svg>`;

  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "public, max-age=30",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
