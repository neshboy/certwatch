import { readFile, writeFile } from "node:fs/promises";
import type { StateFile } from "./types.js";

/** Load a previously-saved state file. Returns undefined if it doesn't exist yet. */
export async function loadState(path: string): Promise<StateFile | undefined> {
  try {
    const raw = await readFile(path, "utf8");
    return JSON.parse(raw) as StateFile;
  } catch (err) {
    if (err && typeof err === "object" && "code" in err && err.code === "ENOENT") {
      return undefined;
    }
    throw err;
  }
}

/** Persist a state file to disk as pretty-printed JSON. */
export async function saveState(path: string, state: StateFile): Promise<void> {
  await writeFile(path, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}
