/**
 * Spiral license validator.
 *
 * Desktop apps POST { license_key, hwid, app }. This Worker calls Whop's
 * validate_license endpoint with the company API key so the key never ships
 * inside the apps. Fail closed.
 */

interface Env {
  WHOP_API_KEY: string;
  WHOP_PRODUCT_ID: string;
}

interface ValidateBody {
  license_key?: string;
  hwid?: string;
  app?: string;
}

const ALLOWED_APPS = new Set(["wallpaper", "clean", "resume", "slim"]);

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors() });
    }

    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/health") {
      return json({ ok: true }, 200);
    }

    if (request.method !== "POST" || url.pathname !== "/validate") {
      return json({ ok: false, error: "not_found" }, 404);
    }

    if (!env.WHOP_API_KEY) {
      return json({ ok: false, error: "validator_not_configured" }, 503);
    }

    let body: ValidateBody;
    try {
      body = (await request.json()) as ValidateBody;
    } catch {
      return json({ ok: false, error: "bad_json" }, 400);
    }

    const licenseKey = (body.license_key ?? "").trim();
    const hwid = (body.hwid ?? "").trim();
    const app = (body.app ?? "").trim().toLowerCase();

    if (!licenseKey || !hwid || !ALLOWED_APPS.has(app)) {
      return json({ ok: false, error: "missing_fields" }, 400);
    }

    const productId = env.WHOP_PRODUCT_ID || "prod_KC9w9zADh9u5F";

    try {
      const membershipRes = await fetch(
        `https://api.whop.com/api/v2/memberships/${encodeURIComponent(licenseKey)}`,
        {
          headers: {
            Authorization: `Bearer ${env.WHOP_API_KEY}`,
            Accept: "application/json",
          },
        },
      );

      if (membershipRes.status === 404) {
        return json({ ok: false, error: "invalid_key" }, 401);
      }
      if (!membershipRes.ok) {
        return json({ ok: false, error: "whop_unavailable" }, 502);
      }

      const membership = (await membershipRes.json()) as {
        status?: string;
        product?: { id?: string };
        valid?: boolean;
      };

      const productOk =
        membership.product?.id === productId ||
        // Some Whop responses nest product under access_pass / product_id.
        (membership as { product_id?: string }).product_id === productId;

      const status = (membership.status ?? "").toLowerCase();
      const statusOk = ["active", "completed", "trialing", "valid"].includes(status);

      if (!productOk || !statusOk) {
        return json({ ok: false, error: "no_access" }, 403);
      }

      const validateRes = await fetch(
        `https://api.whop.com/api/v2/memberships/${encodeURIComponent(licenseKey)}/validate_license`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${env.WHOP_API_KEY}`,
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            metadata: { hwid, app },
          }),
        },
      );

      // 201 = first bind; 200 = matching metadata; 400 = hwid mismatch.
      if (validateRes.status === 400) {
        return json({ ok: false, error: "device_mismatch" }, 403);
      }
      if (validateRes.status !== 200 && validateRes.status !== 201) {
        return json({ ok: false, error: "whop_unavailable" }, 502);
      }

      return json({ ok: true, product_id: productId }, 200);
    } catch {
      return json({ ok: false, error: "whop_unavailable" }, 502);
    }
  },
};

function cors(): HeadersInit {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...cors(),
    },
  });
}
