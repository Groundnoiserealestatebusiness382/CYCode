import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export interface SandboxOptions {
  /** Project directory writes are confined to. */
  cwd: string;
  /** Allow outbound network (default true — research tools need it). */
  allowNetwork: boolean;
}

export interface SpawnSpec {
  file: string;
  args: string[];
}

function sbplQuote(p: string): string {
  return '"' + p.replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"';
}

/**
 * macOS Seatbelt profile (Codex-style "workspace-write"): read anything,
 * write only inside the project, the temp dir, and /dev/null-style devices.
 */
export function buildSeatbeltProfile(opts: SandboxOptions): string {
  const writable = [
    path.resolve(opts.cwd),
    fs.realpathSync(os.tmpdir()),
    "/private/tmp",
    "/dev",
  ];
  const lines = [
    "(version 1)",
    "(allow default)",
    "(deny file-write*)",
    `(allow file-write* ${writable.map((p) => `(subpath ${sbplQuote(p)})`).join(" ")})`,
  ];
  if (!opts.allowNetwork) {
    lines.push("(deny network*)");
  }
  return lines.join("\n");
}

/**
 * Wrap a `bash -c <command>` invocation in the platform sandbox.
 * Fails closed: if sandboxing was requested but no backend is available,
 * this throws instead of silently running unconfined.
 */
export function sandboxedShellSpawn(command: string, opts: SandboxOptions): SpawnSpec {
  if (process.platform === "darwin") {
    return {
      file: "/usr/bin/sandbox-exec",
      args: ["-p", buildSeatbeltProfile(opts), "/bin/bash", "-c", command],
    };
  }
  if (process.platform === "linux") {
    if (!hasBubblewrap()) {
      throw new Error(
        "Sandbox requested but bubblewrap (bwrap) is not installed. " +
          "Install it (e.g. apt install bubblewrap) or disable the sandbox.",
      );
    }
    const cwd = path.resolve(opts.cwd);
    const args = [
      "--ro-bind", "/", "/",
      "--bind", cwd, cwd,
      "--bind", "/tmp", "/tmp",
      "--dev", "/dev",
      "--proc", "/proc",
      "--die-with-parent",
    ];
    if (!opts.allowNetwork) args.push("--unshare-net");
    args.push("/bin/bash", "-c", command);
    return { file: "bwrap", args };
  }
  throw new Error(
    `Sandboxing is not supported on ${process.platform}; disable the sandbox to proceed.`,
  );
}

function hasBubblewrap(): boolean {
  return (process.env.PATH ?? "")
    .split(path.delimiter)
    .some((dir) => {
      try {
        fs.accessSync(path.join(dir, "bwrap"), fs.constants.X_OK);
        return true;
      } catch {
        return false;
      }
    });
}

/** Resolve the spawn spec for a shell command, sandboxed or not. */
export function shellSpawn(
  command: string,
  config: { sandbox?: { bash?: boolean; allowNetwork?: boolean } },
  cwd: string,
): SpawnSpec {
  if (config.sandbox?.bash) {
    return sandboxedShellSpawn(command, {
      cwd,
      allowNetwork: config.sandbox.allowNetwork !== false,
    });
  }
  return { file: "/bin/bash", args: ["-c", command] };
}
