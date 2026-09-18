import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import worker, { isRateLimited, resetRateLimits } from "./index";

const env = {
  WHOP_API_KEY: "test-api-key",
  WHOP_PRODUCT_ID: "prod_test",
};

describe("spiral-license worker", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    resetRateLimits();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("GET /health returns ok", async () => {
    const res = await worker.fetch(new Request("https://license/health"), env);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("OPTIONS returns 204 with CORS", async () => {
    const res = await worker.fetch(new Request("https://license/validate", { method: "OPTIONS" }), env);
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });

  it("unknown route returns 404", async () => {
    const res = await worker.fetch(new Request("https://license/nope"), env);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ ok: false, error: "not_found" });
  });

  it("POST /validate rejects missing fields", async () => {
    const res = await worker.fetch(
      new Request("https://license/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ license_key: "k" }),
      }),
      env,
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, error: "missing_fields" });
  });

  it("POST /validate returns 503 when API key is missing", async () => {
    const res = await worker.fetch(
      new Request("https://license/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ license_key: "k", hwid: "h", app: "wallpaper" }),
      }),
      { WHOP_API_KEY: "", WHOP_PRODUCT_ID: "prod_test" },
    );
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ ok: false, error: "validator_not_configured" });
  });

  it("POST /validate returns invalid_key when Whop membership is 404", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response("", { status: 404 }));

    const res = await worker.fetch(
      new Request("https://license/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ license_key: "bad", hwid: "hw", app: "resume" }),
      }),
      env,
    );

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ ok: false, error: "invalid_key" });
  });

  it("POST /validate returns device_mismatch when Whop returns 400", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ status: "active", product: { id: "prod_test" } }), {
          status: 200,
        }),
      )
      .mockResolvedValueOnce(new Response("", { status: 400 }));

    const res = await worker.fetch(
      new Request("https://license/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ license_key: "good", hwid: "hw", app: "slim" }),
      }),
      env,
    );

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ ok: false, error: "device_mismatch" });
  });

  it("POST /validate succeeds when Whop accepts the key", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ status: "active", product: { id: "prod_test" } }), {
          status: 200,
        }),
      )
      .mockResolvedValueOnce(new Response("", { status: 201 }));

    const res = await worker.fetch(
      new Request("https://license/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ license_key: "good", hwid: "hw", app: "clean" }),
      }),
      env,
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, product_id: "prod_test" });
  });

  it("POST /validate rejects an oversized body", async () => {
    const res = await worker.fetch(
      new Request("https://license/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: `{"license_key":"${"k".repeat(9000)}","hwid":"h","app":"wallpaper"}`,
      }),
      env,
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, error: "bad_json" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("POST /validate rejects bad JSON", async () => {
    const res = await worker.fetch(
      new Request("https://license/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{",
      }),
      env,
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, error: "bad_json" });
  });

  it("POST /validate rejects an unknown app", async () => {
    const res = await worker.fetch(
      new Request("https://license/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ license_key: "k", hwid: "h", app: "notepad" }),
      }),
      env,
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, error: "missing_fields" });
  });

  it("POST /validate returns no_access for the wrong product", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ status: "active", product: { id: "prod_other" } }), {
        status: 200,
      }),
    );

    const res = await worker.fetch(
      new Request("https://license/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ license_key: "k", hwid: "h", app: "wallpaper" }),
      }),
      env,
    );

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ ok: false, error: "no_access" });
  });

  it("POST /validate returns no_access when Whop marks the membership invalid", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({ status: "active", valid: false, product: { id: "prod_test" } }),
        { status: 200 },
      ),
    );

    const res = await worker.fetch(
      new Request("https://license/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ license_key: "k", hwid: "h", app: "resume" }),
      }),
      env,
    );

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ ok: false, error: "no_access" });
  });

  it("POST /validate returns no_access for a cancelled membership", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ status: "canceled", product: { id: "prod_test" } }), {
        status: 200,
      }),
    );

    const res = await worker.fetch(
      new Request("https://license/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ license_key: "k", hwid: "h", app: "slim" }),
      }),
      env,
    );

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ ok: false, error: "no_access" });
  });

  it("POST /validate returns 502 when Whop is down", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response("", { status: 500 }));

    const res = await worker.fetch(
      new Request("https://license/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ license_key: "k", hwid: "h", app: "clean" }),
      }),
      env,
    );

    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ ok: false, error: "whop_unavailable" });
  });

  it("POST /validate rate-limits a chatty client", async () => {
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("validate_license")) {
        return new Response("", { status: 201 });
      }
      return new Response(JSON.stringify({ status: "active", product: { id: "prod_test" } }), {
        status: 200,
      });
    });

    const hit = () =>
      worker.fetch(
        new Request("https://license/validate", {
          method: "POST",
          headers: { "Content-Type": "application/json", "CF-Connecting-IP": "203.0.113.9" },
          body: JSON.stringify({ license_key: "k", hwid: "h", app: "wallpaper" }),
        }),
        env,
      );

    let limited = 0;
    for (let i = 0; i < 31; i++) {
      const res = await hit();
      if (res.status === 429) limited += 1;
    }
    expect(limited).toBeGreaterThan(0);
  });

  it("isRateLimited trips after the window fills", () => {
    const buckets = new Map();
    for (let i = 0; i < 30; i++) {
      expect(isRateLimited(buckets, "ip", 0, 30, 60_000)).toBe(false);
    }
    expect(isRateLimited(buckets, "ip", 0, 30, 60_000)).toBe(true);
    expect(isRateLimited(buckets, "ip", 60_000, 30, 60_000)).toBe(false);
  });
});
