import { describe, expect, it, vi } from "vitest";
import { buildCrtShUrl, queryDomain, queryPattern } from "../src/crtsh.js";
import type { CrtShCertificate } from "../src/types.js";

const SAMPLE_CERT: CrtShCertificate = {
  issuer_ca_id: 432477,
  issuer_name: "C=US, O=Let's Encrypt, CN=YR2",
  common_name: "paypa1-secure.com",
  name_value: "paypa1-secure.com",
  id: 123456789,
  entry_timestamp: "2026-01-01T00:00:00",
  not_before: "2026-01-01T00:00:00",
  not_after: "2026-04-01T00:00:00",
  serial_number: "0abc123",
};

function mockFetchOnce(response: { ok: boolean; status?: number; body?: string }): typeof fetch {
  return vi.fn().mockResolvedValue({
    ok: response.ok,
    status: response.status ?? (response.ok ? 200 : 500),
    text: async () => response.body ?? "",
  }) as unknown as typeof fetch;
}

describe("buildCrtShUrl", () => {
  it("builds a URL against the real crt.sh JSON endpoint", () => {
    const url = buildCrtShUrl("paypal.com");
    expect(url.startsWith("https://crt.sh/?")).toBe(true);
    expect(url).toContain("q=paypal.com");
    expect(url).toContain("output=json");
  });

  it("URL-encodes SQL LIKE wildcard patterns", () => {
    const url = buildCrtShUrl("%paypal%");
    expect(url).toContain("q=%25paypal%25");
  });
});

describe("queryDomain", () => {
  it("parses a mocked crt.sh JSON response into certificate records", async () => {
    const fetchImpl = mockFetchOnce({ ok: true, body: JSON.stringify([SAMPLE_CERT]) });

    const results = await queryDomain("paypa1-secure.com", { fetchImpl });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const calledUrl = (fetchImpl as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(calledUrl).toContain("q=paypa1-secure.com");
    expect(calledUrl).toContain("output=json");

    expect(results).toHaveLength(1);
    expect(results[0].id).toBe(123456789);
    expect(results[0].common_name).toBe("paypa1-secure.com");
  });

  it("returns an empty array when crt.sh has no matches (empty body)", async () => {
    const fetchImpl = mockFetchOnce({ ok: true, body: "" });
    const results = await queryDomain("no-such-domain-xyz.com", { fetchImpl });
    expect(results).toEqual([]);
  });

  it("throws a descriptive error on a non-2xx HTTP response", async () => {
    const fetchImpl = mockFetchOnce({ ok: false, status: 503 });
    await expect(queryDomain("paypal.com", { fetchImpl })).rejects.toThrow(/503/);
  });

  it("throws a descriptive error when crt.sh returns non-JSON (e.g. an overloaded HTML page)", async () => {
    const fetchImpl = mockFetchOnce({ ok: true, body: "<html>Service Unavailable</html>" });
    await expect(queryDomain("paypal.com", { fetchImpl })).rejects.toThrow(/non-JSON|overloaded/);
  });
});

describe("queryPattern", () => {
  it("sends the wildcard pattern through to crt.sh and parses multiple results", async () => {
    const secondCert = { ...SAMPLE_CERT, id: 999, common_name: "paypal-support.com" };
    const fetchImpl = mockFetchOnce({ ok: true, body: JSON.stringify([SAMPLE_CERT, secondCert]) });

    const results = await queryPattern("%paypal%", { fetchImpl });

    const calledUrl = (fetchImpl as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(calledUrl).toContain("q=%25paypal%25");
    expect(results).toHaveLength(2);
    expect(results.map((r) => r.id)).toEqual([123456789, 999]);
  });
});
