import { describe, expect, it } from "vitest";
import { generateCandidates, splitDomain } from "../src/generator.js";

describe("splitDomain", () => {
  it("splits a normal domain into label and tld", () => {
    expect(splitDomain("paypal.com")).toEqual({ domain: "paypal.com", label: "paypal", tld: "com" });
  });

  it("normalizes protocol, www prefix and casing", () => {
    expect(splitDomain("HTTPS://WWW.PayPal.com/login")).toEqual({
      domain: "paypal.com",
      label: "paypal",
      tld: "com",
    });
  });

  it("rejects input with no dot", () => {
    expect(() => splitDomain("paypal")).toThrow();
  });
});

describe("generateCandidates - paypal.com", () => {
  const candidates = generateCandidates("paypal.com");
  const domains = candidates.map((c) => c.domain);

  it("never re-emits the original domain", () => {
    expect(domains).not.toContain("paypal.com");
  });

  it("includes the classic l -> 1 homoglyph substitution", () => {
    expect(domains).toContain("paypa1.com");
  });

  it("includes the l -> i homoglyph substitution (visually near-identical, DNS-lowercased)", () => {
    // The task brief's illustrative example "paypaI-secure.com" relies on the
    // classic lowercase-L / capital-I font confusion. DNS is case-insensitive,
    // so the real, registrable domain is "paypai...", not "paypaI...".
    expect(domains).toContain("paypai.com");
    expect(domains).toContain("paypai-secure.com");
  });

  it("includes an a -> 4 homoglyph substitution", () => {
    expect(domains).toContain("p4ypal.com");
  });

  it("includes common combosquatting prefix/suffix patterns", () => {
    expect(domains).toContain("paypal-secure.com");
    expect(domains).toContain("secure-paypal.com");
    expect(domains).toContain("paypal-support.com");
    expect(domains).toContain("support-paypal.com");
  });

  it("includes TLD-swap variants", () => {
    expect(domains).toContain("paypal.net");
    expect(domains).toContain("paypal.org");
  });

  it("includes a character-doubling insertion typo", () => {
    expect(domains).toContain("paypall.com");
  });

  it("includes a character-deletion typo", () => {
    expect(domains).toContain("paypl.com");
  });

  it("includes an adjacent-character transposition typo", () => {
    expect(domains).toContain("apypal.com");
  });

  it("includes an adjacent-QWERTY-key substitution typo", () => {
    // 'p' and 'o' are adjacent on a QWERTY keyboard.
    expect(domains).toContain("oaypal.com");
  });

  it("tags every candidate with a category and a non-empty note", () => {
    for (const candidate of candidates) {
      expect(candidate.category).toBeTruthy();
      expect(candidate.note.length).toBeGreaterThan(0);
    }
  });

  it("never produces duplicate candidate domains", () => {
    expect(new Set(domains).size).toBe(domains.length);
  });
});

describe("generateCandidates - microsoft.com", () => {
  const candidates = generateCandidates("microsoft.com");
  const domains = candidates.map((c) => c.domain);

  it("includes a plain o -> 0 homoglyph substitution", () => {
    expect(domains).toContain("micr0soft.com");
  });

  it("includes the combined homoglyph + keyword + alternate-TLD pattern from the brief", () => {
    // Mirrors the brief's illustrative "micros0ft-support.net" example exactly.
    expect(domains).toContain("micros0ft-support.net");
  });

  it("includes plain combosquatting on the unmodified label too", () => {
    expect(domains).toContain("microsoft-support.com");
    expect(domains).toContain("support-microsoft.com");
  });
});

describe("generateCandidates - respects maxCandidates", () => {
  it("caps the number of returned candidates", () => {
    const capped = generateCandidates("paypal.com", { maxCandidates: 10 });
    expect(capped.length).toBe(10);
  });
});
