import type { Candidate, CandidateCategory } from "./types.js";

/**
 * Homoglyph / leetspeak substitutions commonly used in real phishing
 * domains. These are all genuinely different DNS labels (not just visual
 * case tricks - DNS is case-insensitive, so "paypaI.com" and "paypal.com"
 * would actually be the *same* domain once lower-cased). Swapping a letter
 * for a digit or a different letter, however, produces a real, distinct,
 * separately-registrable domain that merely *looks* similar in most fonts
 * (e.g. "1" for "l", "0" for "o", "rn" for "m").
 */
const HOMOGLYPH_MAP: Record<string, string[]> = {
  a: ["4"],
  b: ["8"],
  e: ["3"],
  g: ["9"],
  i: ["1", "l"],
  l: ["1", "i"],
  o: ["0"],
  s: ["5"],
  t: ["7"],
  z: ["2"],
  m: ["rn"],
  w: ["vv"],
  d: ["cl"],
};

/** Multi-character source patterns that collapse into a different length. */
const MULTI_CHAR_HOMOGLYPHS: Array<{ from: string; to: string }> = [
  { from: "rn", to: "m" },
  { from: "vv", to: "w" },
  { from: "cl", to: "d" },
];

/** QWERTY row layout, used to build an adjacent-key map for typo generation. */
const KEYBOARD_ROWS = ["qwertyuiop", "asdfghjkl", "zxcvbnm"];

function buildAdjacentKeyMap(): Record<string, string[]> {
  const map: Record<string, string[]> = {};
  for (const row of KEYBOARD_ROWS) {
    for (let i = 0; i < row.length; i++) {
      const c = row[i];
      const neighbors: string[] = [];
      if (i > 0) neighbors.push(row[i - 1]);
      if (i < row.length - 1) neighbors.push(row[i + 1]);
      map[c] = neighbors;
    }
  }
  return map;
}

const ADJACENT_KEY_MAP = buildAdjacentKeyMap();

/** Common brand-abuse prefix/suffix words seen in real phishing domains. */
const COMBOSQUAT_KEYWORDS = [
  "secure",
  "support",
  "verify",
  "login",
  "account",
  "service",
  "online",
  "update",
  "billing",
  "alert",
];

/** A small set of alternate TLDs commonly abused for lookalike registrations. */
const ALT_TLDS = ["net", "org", "info", "online", "xyz", "co"];

export interface ParsedDomain {
  /** The full, normalized (lower-cased, trimmed) input domain. */
  domain: string;
  /** The registrable label, e.g. "paypal" for "paypal.com". */
  label: string;
  /** The TLD/suffix after the last dot, e.g. "com". */
  tld: string;
}

/**
 * Normalize and split a domain into its label and TLD.
 *
 * This is intentionally simple: it splits on the last "." only. Domains
 * with multi-part public suffixes (e.g. "example.co.uk") will have their
 * "label" computed as "example.co" and "tld" as "uk" - see README
 * Limitations. That's fine for the brand names this tool targets in
 * practice (single-label TLDs like .com/.net/.org).
 */
export function splitDomain(domain: string): ParsedDomain {
  const normalized = domain
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .replace(/^www\./, "");

  const lastDot = normalized.lastIndexOf(".");
  if (lastDot === -1 || lastDot === 0 || lastDot === normalized.length - 1) {
    throw new Error(`"${domain}" does not look like a valid "label.tld" domain`);
  }

  return {
    domain: normalized,
    label: normalized.slice(0, lastDot),
    tld: normalized.slice(lastDot + 1),
  };
}

function makeCandidate(label: string, tld: string, category: CandidateCategory, note: string): Candidate {
  return { domain: `${label}.${tld}`, category, note };
}

/** Single-character homoglyph/leetspeak substitutions, one at a time. */
export function generateHomoglyphs(label: string): Array<{ label: string; note: string }> {
  const out: Array<{ label: string; note: string }> = [];
  for (let i = 0; i < label.length; i++) {
    const ch = label[i];
    const replacements = HOMOGLYPH_MAP[ch];
    if (!replacements) continue;
    for (const r of replacements) {
      const variant = label.slice(0, i) + r + label.slice(i + 1);
      out.push({ label: variant, note: `homoglyph: "${ch}" -> "${r}" at position ${i}` });
    }
  }
  for (const { from, to } of MULTI_CHAR_HOMOGLYPHS) {
    let searchFrom = 0;
    for (;;) {
      const idx = label.indexOf(from, searchFrom);
      if (idx === -1) break;
      const variant = label.slice(0, idx) + to + label.slice(idx + from.length);
      out.push({ label: variant, note: `homoglyph: "${from}" -> "${to}" at position ${idx}` });
      searchFrom = idx + 1;
    }
  }
  return out;
}

/** Character-doubling insertion typos, e.g. "paypal" -> "paypall". */
export function generateInsertionTypos(label: string): Array<{ label: string; note: string }> {
  const out: Array<{ label: string; note: string }> = [];
  for (let i = 0; i < label.length; i++) {
    const variant = label.slice(0, i + 1) + label[i] + label.slice(i + 1);
    out.push({ label: variant, note: `typo: doubled "${label[i]}" at position ${i}` });
  }
  return out;
}

/** Single-character deletion typos, e.g. "paypal" -> "paypl". */
export function generateDeletionTypos(label: string): Array<{ label: string; note: string }> {
  const out: Array<{ label: string; note: string }> = [];
  for (let i = 0; i < label.length; i++) {
    if (label.length <= 1) continue;
    const variant = label.slice(0, i) + label.slice(i + 1);
    out.push({ label: variant, note: `typo: dropped "${label[i]}" at position ${i}` });
  }
  return out;
}

/** Adjacent-character transposition typos, e.g. "paypal" -> "apypal". */
export function generateTranspositionTypos(label: string): Array<{ label: string; note: string }> {
  const out: Array<{ label: string; note: string }> = [];
  for (let i = 0; i < label.length - 1; i++) {
    if (label[i] === label[i + 1]) continue; // swapping identical chars is a no-op
    const chars = label.split("");
    [chars[i], chars[i + 1]] = [chars[i + 1], chars[i]];
    out.push({ label: chars.join(""), note: `typo: transposed "${label[i]}${label[i + 1]}" at position ${i}` });
  }
  return out;
}

/** Adjacent-QWERTY-key substitution typos, e.g. "paypal" -> "oaypal" (p<->o). */
export function generateAdjacentKeyTypos(label: string): Array<{ label: string; note: string }> {
  const out: Array<{ label: string; note: string }> = [];
  for (let i = 0; i < label.length; i++) {
    const ch = label[i];
    const neighbors = ADJACENT_KEY_MAP[ch];
    if (!neighbors) continue;
    for (const n of neighbors) {
      const variant = label.slice(0, i) + n + label.slice(i + 1);
      out.push({ label: variant, note: `typo: adjacent key "${ch}" -> "${n}" at position ${i}` });
    }
  }
  return out;
}

export interface GenerateOptions {
  /** Cap on total candidates returned (safety valve for very long labels). Default 500. */
  maxCandidates?: number;
}

/**
 * Generate the full list of candidate lookalike domains for a brand domain,
 * combining homoglyph substitutions, common typo patterns, combosquatting
 * (brand + security-themed keyword) and TLD-swap variants.
 */
export function generateCandidates(domainInput: string, options: GenerateOptions = {}): Candidate[] {
  const { label, tld, domain } = splitDomain(domainInput);
  const maxCandidates = options.maxCandidates ?? 500;

  const candidates: Candidate[] = [];
  const seen = new Set<string>([domain]);

  const add = (labelVariant: string, tldVariant: string, category: CandidateCategory, note: string) => {
    const full = `${labelVariant}.${tldVariant}`;
    if (seen.has(full)) return;
    seen.add(full);
    candidates.push(makeCandidate(labelVariant, tldVariant, category, note));
  };

  // 1. Homoglyph / leetspeak substitutions.
  const homoglyphVariants = generateHomoglyphs(label);
  for (const { label: v, note } of homoglyphVariants) add(v, tld, "homoglyph", note);

  // 2. Typo patterns: insertion, deletion, transposition, adjacent-key.
  for (const { label: v, note } of generateInsertionTypos(label)) add(v, tld, "typo-insertion", note);
  for (const { label: v, note } of generateDeletionTypos(label)) add(v, tld, "typo-deletion", note);
  for (const { label: v, note } of generateTranspositionTypos(label)) add(v, tld, "typo-transposition", note);
  for (const { label: v, note } of generateAdjacentKeyTypos(label)) add(v, tld, "typo-adjacent-key", note);

  // 3. Combosquatting: brand + security-themed keyword, same TLD.
  for (const word of COMBOSQUAT_KEYWORDS) {
    add(`${label}-${word}`, tld, "combosquat-suffix", `keyword suffix "-${word}"`);
    add(`${word}-${label}`, tld, "combosquat-prefix", `keyword prefix "${word}-"`);
  }

  // 4. TLD-swap: same label, commonly-abused alternate TLDs.
  for (const alt of ALT_TLDS) {
    if (alt === tld) continue;
    add(label, alt, "tld-swap", `TLD swapped "${tld}" -> "${alt}"`);
  }

  // 5. Combined homoglyph + combosquat, for a small focused keyword set and
  //    including the original TLD plus ".net" (mirrors the classic
  //    "brand-with-substitution + support/secure word + alternate TLD"
  //    phishing pattern, e.g. "micros0ft-support.net").
  const focusedKeywords = ["secure", "support"];
  const focusedTlds = Array.from(new Set([tld, "net"]));
  for (const { label: v } of homoglyphVariants) {
    for (const word of focusedKeywords) {
      for (const t of focusedTlds) {
        add(`${v}-${word}`, t, "combosquat-suffix", `homoglyph label + keyword suffix "-${word}"`);
        add(`${word}-${v}`, t, "combosquat-prefix", `keyword prefix "${word}-" + homoglyph label`);
      }
    }
  }

  return candidates.slice(0, maxCandidates);
}
