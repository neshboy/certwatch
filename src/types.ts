/** A single candidate lookalike domain produced by the generator. */
export interface Candidate {
  /** The full candidate domain, e.g. "paypa1.com". */
  domain: string;
  /** Which technique produced this candidate. */
  category: CandidateCategory;
  /** Short human-readable note about how it was derived, e.g. "l -> 1". */
  note: string;
}

export type CandidateCategory =
  | "homoglyph"
  | "typo-insertion"
  | "typo-deletion"
  | "typo-transposition"
  | "typo-adjacent-key"
  | "combosquat-prefix"
  | "combosquat-suffix"
  | "tld-swap";

/**
 * A certificate record as returned by crt.sh's `output=json` endpoint.
 * crt.sh returns more fields than this in practice; we only model the ones
 * CertWatch actually uses and keep the type permissive for the rest.
 */
export interface CrtShCertificate {
  id: number;
  issuer_ca_id?: number;
  issuer_name?: string;
  common_name: string;
  name_value: string;
  entry_timestamp?: string;
  not_before?: string;
  not_after?: string;
  serial_number?: string;
  [key: string]: unknown;
}

/** Results of querying crt.sh for a single candidate domain. */
export interface CandidateResult {
  candidate: Candidate;
  certificates: CrtShCertificate[];
}

/**
 * Persisted local state: for every candidate domain we've ever scanned,
 * which crt.sh certificate IDs we have already seen. Used to diff a new
 * scan against a previous one and only surface NEW sightings.
 */
export interface StateFile {
  /** ISO timestamp of the last successful scan that produced this file. */
  lastScan: string;
  /** The brand domain this state file was built for. */
  brand: string;
  /** candidate domain -> certificate ids already seen for it. */
  seen: Record<string, number[]>;
}

/** A single new-finding entry emitted by the diff step. */
export interface Finding {
  candidate: string;
  certificate: CrtShCertificate;
}
