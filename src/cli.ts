#!/usr/bin/env node
import { Command } from "commander";
import { generateCandidates, splitDomain } from "./generator.js";
import { queryDomain, queryPattern, sleep } from "./crtsh.js";
import { diffFindings, mergeState } from "./diff.js";
import { loadState, saveState } from "./state.js";
import type { CrtShCertificate } from "./types.js";

const program = new Command();

program
  .name("certwatch")
  .description(
    "Watches Certificate Transparency logs (crt.sh) for newly issued TLS certificates on homoglyph/lookalike domains of a brand you specify.",
  )
  .version("0.1.0");

program
  .command("generate <domain>")
  .description("Generate candidate homoglyph/typo/combosquat lookalike domains for a brand domain")
  .option("--json", "output as JSON instead of a human-readable list")
  .action((domain: string, opts: { json?: boolean }) => {
    const candidates = generateCandidates(domain);

    if (opts.json) {
      console.log(JSON.stringify(candidates, null, 2));
      return;
    }

    console.log(`Generated ${candidates.length} candidate lookalike domain(s) for ${domain}:\n`);
    for (const c of candidates) {
      console.log(`  ${c.domain.padEnd(38)} [${c.category}] ${c.note}`);
    }
  });

program
  .command("scan <domain>")
  .description(
    "Generate lookalike candidates, query crt.sh for each, and report NEW certificate sightings since the last scan",
  )
  .option("--save <file>", "state file to diff against / update", "certwatch-state.json")
  .option("--delay <ms>", "delay between crt.sh requests in ms (real rate limiting)", "1500")
  .option("--limit <n>", "only scan the first N generated candidates (useful for quick tests)")
  .option(
    "--wildcard",
    "also run one crt.sh wildcard sweep (%label%) to surface matches outside the generated candidate list (informational only)",
    false,
  )
  .action(
    async (
      domain: string,
      opts: { save: string; delay: string; limit?: string; wildcard: boolean },
    ) => {
      const delayMs = Number(opts.delay);
      const allCandidates = generateCandidates(domain);
      const candidates = opts.limit ? allCandidates.slice(0, Number(opts.limit)) : allCandidates;

      console.log(`Scanning ${candidates.length} candidate domain(s) for "${domain}" against crt.sh...`);
      console.log(`(rate-limited: ${delayMs}ms delay between requests)\n`);

      const previous = await loadState(opts.save);
      const current: Record<string, CrtShCertificate[]> = {};

      for (let i = 0; i < candidates.length; i++) {
        if (i > 0) await sleep(delayMs);
        const candidate = candidates[i];
        try {
          const certificates = await queryDomain(candidate.domain);
          current[candidate.domain] = certificates;
          if (certificates.length > 0) {
            console.log(`  [${String(certificates.length).padStart(2)} cert(s)] ${candidate.domain}`);
          }
        } catch (err) {
          console.warn(`  ! query failed for ${candidate.domain}: ${(err as Error).message}`);
        }
      }

      if (opts.wildcard) {
        await runWildcardSweep(domain, candidates.map((c) => c.domain));
      }

      const findings = diffFindings(previous, current);
      const newState = mergeState(previous, domain, current);
      await saveState(opts.save, newState);

      console.log(`\nScan complete. State saved to ${opts.save}.`);

      if (findings.length === 0) {
        console.log(
          previous
            ? "No NEW certificate sightings since the last scan."
            : "No certificates found for any generated candidate on this first scan.",
        );
        return;
      }

      console.log(`\n${findings.length} NEW certificate sighting(s):\n`);
      for (const finding of findings) {
        console.log(`  NEW: ${finding.candidate}`);
        console.log(`       common_name: ${finding.certificate.common_name}`);
        console.log(`       issuer:      ${finding.certificate.issuer_name ?? "unknown"}`);
        console.log(`       not_before:  ${finding.certificate.not_before ?? "unknown"}`);
        console.log(`       crt.sh:      https://crt.sh/?id=${finding.certificate.id}\n`);
      }
    },
  );

async function runWildcardSweep(domain: string, knownCandidateDomains: string[]): Promise<void> {
  const { label } = splitDomain(domain);
  const pattern = `%${label}%`;
  console.log(`\nRunning wildcard sweep: q=${pattern}`);

  try {
    const results = await queryPattern(pattern);
    const known = new Set([domain.toLowerCase(), ...knownCandidateDomains]);
    const extraNames = new Set<string>();

    for (const cert of results) {
      for (const rawName of cert.name_value.split("\n")) {
        const name = rawName.trim().toLowerCase();
        if (name && !known.has(name)) extraNames.add(name);
      }
    }

    console.log(
      `Wildcard sweep returned ${results.length} certificate(s) covering ${extraNames.size} name(s) ` +
        `not already in the generated candidate list (informational only, not diffed against saved state):`,
    );
    for (const name of Array.from(extraNames).slice(0, 25)) {
      console.log(`  - ${name}`);
    }
  } catch (err) {
    console.warn(`Wildcard sweep failed: ${(err as Error).message}`);
  }
}

program.parseAsync(process.argv).catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
