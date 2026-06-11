import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/** Read lazily so tests (and wrappers) can point CYCODE_HOME at a sandbox. */
export function cycodeHome(): string {
  return process.env.CYCODE_HOME ?? path.join(os.homedir(), ".cycode");
}

export function ensureDir(dir: string): string {
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** Stable, filesystem-safe identifier for a project directory. */
export function projectSlug(cwd: string): string {
  const slug = path
    .resolve(cwd)
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug.slice(-80) || "root";
}

export function sessionsDir(cwd: string): string {
  return ensureDir(path.join(cycodeHome(), "sessions", projectSlug(cwd)));
}

export function papersDir(): string {
  return ensureDir(path.join(cycodeHome(), "papers"));
}

/** Resolve a possibly-relative path against a base directory. */
export function resolveIn(cwd: string, p: string): string {
  return path.isAbsolute(p) ? p : path.resolve(cwd, p);
}
