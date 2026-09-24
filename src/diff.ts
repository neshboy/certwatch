import type { CrtShCertificate, Finding, StateFile } from "./types.js";

/**
 * Compare a fresh round of crt.sh results against previously-saved state and
 * return only the certificates that were NOT seen in a prior scan (by
 * crt.sh certificate id, per candidate domain).
 *
 * `previous` may be undefined (first-ever scan) - in that case every
 * certificate found is reported as "new", since there's nothing to diff
 * against.
 */
export function diffFindings(
  previous: StateFile | undefined,
  current: Record<string, CrtShCertificate[]>,
): Finding[] {
  const findings: Finding[] = [];

  for (const [candidate, certificates] of Object.entries(current)) {
    const previouslySeen = new Set(previous?.seen[candidate] ?? []);
    for (const certificate of certificates) {
      if (!previouslySeen.has(certificate.id)) {
        findings.push({ candidate, certificate });
      }
    }
  }

  return findings;
}

/**
 * Merge a fresh round of crt.sh results into a state file: the result
 * contains every certificate id ever seen for every candidate (previous
 * scans plus this one), ready to be persisted and diffed against next time.
 */
export function mergeState(
  previous: StateFile | undefined,
  brand: string,
  current: Record<string, CrtShCertificate[]>,
): StateFile {
  const seen: Record<string, number[]> = {};

  if (previous) {
    for (const [candidate, ids] of Object.entries(previous.seen)) {
      seen[candidate] = [...ids];
    }
  }

  for (const [candidate, certificates] of Object.entries(current)) {
    const merged = new Set(seen[candidate] ?? []);
    for (const certificate of certificates) merged.add(certificate.id);
    seen[candidate] = Array.from(merged).sort((a, b) => a - b);
  }

  return {
    lastScan: new Date().toISOString(),
    brand,
    seen,
  };
}
