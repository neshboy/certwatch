// Manual, one-off live smoke test against the real crt.sh API using the
// actual CertWatch HTTP client (not curl). Not part of the automated test
// suite (network access is not guaranteed in CI/sandboxes), but useful to
// run by hand to confirm real connectivity. See README "Development" notes.
import { queryDomain } from "../src/crtsh.js";

const target = process.argv[2] ?? "github.com";
const started = Date.now();

try {
  const results = await queryDomain(target);
  console.log(`OK: crt.sh returned ${results.length} certificate record(s) for "${target}" in ${Date.now() - started}ms`);
  if (results.length > 0) {
    const r = results[0];
    console.log("sample record:", {
      id: r.id,
      common_name: r.common_name,
      issuer_name: r.issuer_name,
      not_before: r.not_before,
    });
  }
} catch (err) {
  console.error(`FAILED after ${Date.now() - started}ms:`, (err as Error).message);
  process.exitCode = 1;
}
