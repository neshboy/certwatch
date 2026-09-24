import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { diffFindings, mergeState } from "../src/diff.js";
import type { CrtShCertificate, StateFile } from "../src/types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadFixture<T>(name: string): T {
  const raw = readFileSync(path.join(__dirname, "fixtures", name), "utf8");
  return JSON.parse(raw) as T;
}

describe("diffFindings", () => {
  const previous = loadFixture<StateFile>("previous-state.json");
  const current = loadFixture<Record<string, CrtShCertificate[]>>("current-scan-results.json");

  it("only reports certificates that are NEW relative to the previous state", () => {
    // Fixture setup:
    //  - paypa1.com: id 100 was already seen, id 150 is new.
    //  - paypal-secure.com: ids 200 and 201 were both already seen.
    //  - secure-paypal.com: brand new candidate, id 300 is new.
    //  - paypal-support.com: no certificates found at all.
    const findings = diffFindings(previous, current);
    const findingKeys = findings.map((f) => `${f.candidate}#${f.certificate.id}`).sort();

    expect(findingKeys).toEqual(["paypa1.com#150", "secure-paypal.com#300"]);
  });

  it("treats every certificate as new when there is no previous state (first-ever scan)", () => {
    const findings = diffFindings(undefined, current);
    const expectedCount = Object.values(current).reduce((sum, certs) => sum + certs.length, 0);
    expect(findings).toHaveLength(expectedCount);
  });

  it("reports nothing new when the current scan exactly matches the previous state", () => {
    const sameAsPrevious: Record<string, CrtShCertificate[]> = {
      "paypa1.com": [{ id: 100, common_name: "paypa1.com", name_value: "paypa1.com" }],
      "paypal-secure.com": [
        { id: 200, common_name: "paypal-secure.com", name_value: "paypal-secure.com" },
        { id: 201, common_name: "paypal-secure.com", name_value: "paypal-secure.com" },
      ],
    };
    expect(diffFindings(previous, sameAsPrevious)).toEqual([]);
  });
});

describe("mergeState", () => {
  const previous = loadFixture<StateFile>("previous-state.json");
  const current = loadFixture<Record<string, CrtShCertificate[]>>("current-scan-results.json");

  it("unions previously-seen certificate ids with newly-seen ones, per candidate", () => {
    const merged = mergeState(previous, "paypal.com", current);

    expect(merged.brand).toBe("paypal.com");
    expect(merged.seen["paypa1.com"]).toEqual([100, 150]);
    expect(merged.seen["paypal-secure.com"]).toEqual([200, 201]);
    expect(merged.seen["secure-paypal.com"]).toEqual([300]);
    expect(merged.seen["paypal-support.com"]).toEqual([]);
  });

  it("produces a state that, when diffed against the same scan again, yields no new findings", () => {
    const merged = mergeState(previous, "paypal.com", current);
    expect(diffFindings(merged, current)).toEqual([]);
  });

  it("is idempotent to merge repeatedly with the same results", () => {
    const mergedOnce = mergeState(previous, "paypal.com", current);
    const mergedTwice = mergeState(mergedOnce, "paypal.com", current);
    expect(mergedTwice.seen).toEqual(mergedOnce.seen);
  });
});
