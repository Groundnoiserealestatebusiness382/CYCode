import { loadConfig, saveProjectPermission, type CycodeConfig } from "./config.js";
import { resolveModel, defaultModelSpec, smallModelSpec } from "./provider/registry.js";
import { getContextWindow } from "./provider/models.js";
import { coreTools } from "./tools/core/index.js";
import { webSearchTool, webSearchAvailable } from "./tools/core/web_search.js";
import { researchTools } from "./tools/research/index.js";
import type { CycodeTool } from "./tools/types.js";
import { Agent } from "./agent/loop.js";
import { EventBus } from "./agent/events.js";
import { createExploreTool } from "./agent/subagent.js";
import { buildSystemPrompt, loadContextFiles } from "./context/context.js";
import { loadSkills, type Skill } from "./skills/skills.js";
import { connectMcpServers } from "./mcp/client.js";
import { SessionStore } from "./session/store.js";
import type { PermissionArbiter, PermissionMode } from "./permissions/permissions.js";

export interface RuntimeOptions {
  cwd: string;
  modelSpec?: string;
  mode?: PermissionMode;
  arbiter: PermissionArbiter;
  /** Resume the most recent session for this project. */
  continueSession?: boolean;
  /** Resume a specific session id. */
  resumeId?: string;
  /** Skip session persistence entirely (used by exec mode by default). */
  noSession?: boolean;
  maxStepsPerTurn?: number;
  /** Force OS-level sandboxing of shell commands regardless of config. */
  sandbox?: boolean;
  onNotice?: (message: string) => void;
}

export interface Runtime {
  agent: Agent;
  bus: EventBus;
  skills: Skill[];
  modelSpec: string;
  config: CycodeConfig;
  session?: SessionStore;
  /** Hot-swap the model; throws on an invalid spec. Updates `modelSpec`. */
  switchModel: (spec: string) => void;
  close: () => Promise<void>;
}

export async function createRuntime(opts: RuntimeOptions): Promise<Runtime> {
  const config = loadConfig(opts.cwd);
  if (opts.sandbox) config.sandbox = { ...config.sandbox, bash: true };
  const modelSpec = opts.modelSpec ?? defaultModelSpec(config);
  const model = resolveModel(modelSpec, config);
  const smallSpec = smallModelSpec(config, modelSpec);
  const contextWindow = getContextWindow(modelSpec, config);
  const mode = opts.mode ?? "default";
  const skills = loadSkills(opts.cwd);
  const notice = opts.onNotice ?? (() => {});

  const mcp = await connectMcpServers(config, notice);

  const localTools: CycodeTool[] = [...coreTools, ...researchTools];
  if (webSearchAvailable()) localTools.push(webSearchTool);
  const exploreTool = createExploreTool({
    cwd: opts.cwd,
    config,
    model,
    modelSpec,
    contextWindow,
    tools: localTools,
  });
  const tools = [...localTools, exploreTool, ...mcp.tools];

  let session: SessionStore | undefined;
  if (!opts.noSession) {
    if (opts.resumeId) session = SessionStore.open(opts.cwd, opts.resumeId);
    else if (opts.continueSession) {
      session = SessionStore.latest(opts.cwd) ?? SessionStore.create(opts.cwd, modelSpec);
    } else session = SessionStore.create(opts.cwd, modelSpec);
    if ((opts.resumeId || opts.continueSession) && session) {
      const n = session.loadMessages().length;
      if (n > 0) notice(`Resumed session ${session.meta.id} (${n} messages)`);
    }
  }

  const bus = new EventBus();
  const agent = new Agent({
    cwd: opts.cwd,
    config,
    model,
    smallModel: smallSpec === modelSpec ? undefined : resolveModel(smallSpec, config),
    systemPrompt: buildSystemPrompt({
      cwd: opts.cwd,
      modelSpec,
      mode,
      contextFiles: loadContextFiles(opts.cwd),
      skills,
    }),
    mode,
    arbiter: opts.arbiter,
    tools,
    bus,
    session,
    contextWindow,
    maxStepsPerTurn: opts.maxStepsPerTurn,
    onAlwaysAllow: (rule) => saveProjectPermission(opts.cwd, rule),
  });

  const runtime: Runtime = {
    agent,
    bus,
    skills,
    modelSpec,
    config,
    session,
    switchModel: (spec: string) => {
      const nextModel = resolveModel(spec, config);
      const nextWindow = getContextWindow(spec, config);
      agent.setModel(nextModel, nextWindow);
      agent.systemPrompt = buildSystemPrompt({
        cwd: opts.cwd,
        modelSpec: spec,
        mode: agent.mode,
        contextFiles: loadContextFiles(opts.cwd),
        skills,
      });
      runtime.modelSpec = spec;
    },
    close: mcp.close,
  };
  return runtime;
}
