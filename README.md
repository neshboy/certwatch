# CertWatch

CertWatch watches public **Certificate Transparency (CT) logs** for newly
issued TLS certificates on **homoglyph / lookalike domains** of a brand you
specify - e.g. `payp4l.com`, `paypai-secure.com`, or `micros0ft-support.net`
as lookalikes of `paypal.com` / `microsoft.com`.

## Why this works

Every publicly-trusted TLS certificate issued today is logged in a
[Certificate Transparency](https://certificate.transparency.dev/) log -
that's a requirement enforced by every major browser. Phishing sites almost
always need a real TLS certificate to avoid "Not Secure" warnings, and the
moment a CA issues one, it's published in CT logs, searchable in real time.

That means: **the instant someone registers `payp4l.com` and gets a
certificate for it, it becomes visible** - often before the phishing site
is even fully built out. Monitoring CT logs for lookalikes of your brand is
a real, well-established early-warning technique used by security and
anti-phishing teams. CertWatch automates the two halves of that workflow:

1. **Generate** a realistic set of lookalike domains for a brand (homoglyphs,
   typos, and combosquatting patterns attackers actually use).
2. **Scan** [crt.sh](https://crt.sh/) (a free, public CT log search service
   run by Sectigo, no API key required) for each candidate, and tell you
   which ones **actually have a real certificate issued** - and which of
   those are **new** since the last time you checked.

## What it actually found (real example)

Running CertWatch against `paypal.com` against the live crt.sh API turned up
real, currently-registered lookalike domains with real certificates,
including `payp4l.com` and `p4ypal.com` (both homoglyph substitutions of
`paypal.com`, both with certificates from public CAs like Let's Encrypt,
GoDaddy, and DigiCert). This is exactly the kind of signal CertWatch is built
to surface - whether any specific hit is malicious still requires human
review (see [Limitations](#limitations)).

## Install / quick start

```bash
git clone <this-repo>
cd certwatch
npm install
npm run build

# Generate candidate lookalike domains for a brand (no network calls):
node dist/cli.js generate paypal.com

# Scan crt.sh for real, currently-issued certificates on those candidates,
# and report anything NEW since the last scan (state is saved to disk):
node dist/cli.js scan paypal.com --save paypal-state.json
```

Or, during development, skip the build step:

```bash
npm run dev -- generate paypal.com
npm run dev -- scan paypal.com --save paypal-state.json
```

### `certwatch generate <domain>`

Prints every candidate lookalike domain CertWatch would check for a brand,
tagged with the technique that produced it. No network access - this is
pure local generation.

```
$ certwatch generate paypal.com
Generated 86 candidate lookalike domain(s) for paypal.com:

  paypa1.com                           [homoglyph] homoglyph: "l" -> "1" at position 5
  paypai.com                           [homoglyph] homoglyph: "l" -> "i" at position 5
  paypal-secure.com                    [combosquat-suffix] keyword suffix "-secure"
  secure-paypal.com                    [combosquat-prefix] keyword prefix "secure-"
  paypal.net                           [tld-swap] TLD swapped "com" -> "net"
  ...
```

Add `--json` for machine-readable output.

### `certwatch scan <domain> [--save state.json] [--delay ms] [--limit n] [--wildcard]`

1. Generates the candidate list (same as `generate`).
2. Queries crt.sh for each candidate domain, one at a time, with a
   real delay between requests (`--delay`, default 1500ms) to be a good
   citizen of a free public service.
3. Diffs the results against the previous run's saved state
   (`--save`, default `certwatch-state.json`) and prints only the
   **new** certificate sightings - a repeat scan won't re-alert you on
   something you already saw.
4. Saves the updated state back to disk.

Optional `--wildcard` also runs one crt.sh `LIKE`-pattern query
(`%label%`, crt.sh's native SQL wildcard syntax) to surface certificates
for names outside the generated candidate list - useful as a broader net,
reported informationally and not diffed against saved state.

Run it again later (e.g. from a cron job / scheduled task) and it will only
report what's changed:

```
$ certwatch scan paypal.com --save paypal-state.json
Scanning 86 candidate domain(s) for "paypal.com" against crt.sh...
(rate-limited: 1500ms delay between requests)

  [ 3 cert(s)] payp4l.com

Scan complete. State saved to paypal-state.json.

3 NEW certificate sighting(s):

  NEW: payp4l.com
       common_name: www.payp4l.com
       issuer:      C=US, O=GoDaddy.com, CN=GoDaddy TLS Intermediate CA DV - R1v1
       not_before:  2026-06-05T23:13:53
       crt.sh:      https://crt.sh/?id=27021117298
```

## How candidates are generated

For a brand domain like `paypal.com` (label `paypal`, TLD `com`), CertWatch
combines several real, documented phishing-domain patterns:

- **Homoglyph / leetspeak substitutions**: `o`->`0`, `l`->`1`/`i`, `e`->`3`,
  `a`->`4`, `s`->`5`, `g`->`9`, `t`->`7`, `rn`->`m`, `m`->`rn`, `vv`->`w`,
  `cl`->`d`, etc. (Note: DNS is case-insensitive, so a visual trick like
  capital `I` for lowercase `l` is really the letter `i` once registered -
  CertWatch generates the real, registrable form.)
- **Typos**: character insertion (doubling), deletion, adjacent-character
  transposition, and adjacent-QWERTY-key substitution - a similar spirit to
  this portfolio's `typosquatwatch` similarity engine, reimplemented here
  independently for domain labels rather than package names.
- **Combosquatting**: brand + security-themed keyword, e.g.
  `paypal-secure.com`, `secure-paypal.com`, `paypal-support.com`, plus a
  focused homoglyph+keyword+alt-TLD combination (e.g.
  `micros0ft-support.net`) mirroring real-world phishing kits.
- **TLD-swap**: same label, alternate TLDs commonly abused in lookalike
  registrations (`.net`, `.org`, `.info`, `.online`, `.xyz`, `.co`).

## Development

```bash
npm install
npm run typecheck   # tsc --noEmit
npm test            # vitest run
npm run build        # compile to dist/
```

The test suite (`npm test`) is fully deterministic: the crt.sh HTTP client
is unit-tested against a mocked `fetch`, and the generator/diff logic are
tested against fixed inputs and fixtures - no network access required to
run `npm test`.

If you want to check real connectivity, there's a small manual script that
performs one live query against the real crt.sh endpoint using the actual
HTTP client (not part of the automated suite, since network access isn't
guaranteed in every environment):

```bash
npx tsx scripts/live-check.mts github.com
```

## Limitations

- **CertWatch only checks the candidates it generates.** It is not an
  exhaustive search of "every possible variation" of a domain - a
  sufficiently creative attacker can always pick a lookalike outside the
  generated list. The optional `--wildcard` sweep helps but is still just
  one broader pattern query, not a full CT-log crawl.
- **crt.sh can be slow, flaky, or rate-limited.** It's a free public
  service backed by a large Postgres database; some queries take many
  seconds, and it occasionally returns errors or non-JSON responses under
  load. CertWatch surfaces per-candidate query failures as warnings and
  continues the scan rather than aborting, but a transient failure can mean
  a real hit is missed until the next scan.
- **A hit doesn't confirm malicious intent.** A generated lookalike domain
  having a real certificate just means someone registered that domain and
  got a certificate for it - it could be a defensive registration by the
  brand itself, an unrelated coincidence, a parked domain, or genuine
  phishing infrastructure. Human review of each finding is still necessary.
- **Domain parsing is simplified.** CertWatch splits on the last `.` only,
  so multi-part public suffixes (e.g. `example.co.uk`) aren't handled
  specially - see `splitDomain` in `src/generator.ts`.
- **Only ASCII confusable substitutions are covered.** Full Unicode/IDN
  homograph attacks (e.g. Cyrillic look-alike characters that punycode-encode
  to a different domain) are out of scope for this MVP.

## License

MIT - see [LICENSE](./LICENSE).
