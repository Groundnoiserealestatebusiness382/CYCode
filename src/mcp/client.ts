import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { jsonSchema } from "ai";
import type { CycodeConfig, McpServerConfig } from "../config.js";
import type { CycodeTool } from "../tools/types.js";

export interface McpConnection {
  tools: CycodeTool[];
  close: () => Promise<void>;
}

async function connectServer(
  name: string,
  server: McpServerConfig,
): Promise<{ client: Client; tools: CycodeTool[] }> {
  const client = new Client({ name: "cycode", version: "0.1.0" });
  if (server.url) {
    await client.connect(new StreamableHTTPClientTransport(new URL(server.url)));
  } else if (server.command) {
    await client.connect(
      new StdioClientTransport({
        command: server.command,
        args: server.args ?? [],
        env: { ...process.env, ...server.env } as Record<string, string>,
      }),
    );
  } else {
    throw new Error(`MCP server "${name}" needs either "command" or "url"`);
  }

  const { tools } = await client.listTools();
  const wrapped: CycodeTool[] = tools.map((t) => ({
    name: `mcp__${name}__${t.name}`,
    description: t.description ?? `${t.name} (MCP tool from ${name})`,
    inputSchema: jsonSchema<any>((t.inputSchema as any) ?? { type: "object" }),
    readOnly: t.annotations?.readOnlyHint === true,
    describeCall: () => `mcp__${name}__${t.name}`,
    async execute(input) {
      const result = await client.callTool({ name: t.name, arguments: input ?? {} });
      const content = (result.content ?? []) as Array<{
        type: string;
        text?: string;
      }>;
      const text = content
        .map((c) => (c.type === "text" ? (c.text ?? "") : `[${c.type} content]`))
        .join("\n");
      if (result.isError) throw new Error(text || "MCP tool reported an error");
      return text || "(empty result)";
    },
  }));
  return { client, tools: wrapped };
}

/** Connect all configured MCP servers; failures become notices, not fatal errors. */
export async function connectMcpServers(
  config: CycodeConfig,
  onNotice: (message: string) => void,
): Promise<McpConnection> {
  const clients: Client[] = [];
  const tools: CycodeTool[] = [];
  for (const [name, server] of Object.entries(config.mcpServers ?? {})) {
    try {
      const { client, tools: serverTools } = await connectServer(name, server);
      clients.push(client);
      tools.push(...serverTools);
      onNotice(`MCP server "${name}" connected (${serverTools.length} tools)`);
    } catch (err) {
      onNotice(
        `MCP server "${name}" failed to connect: ${err instanceof Error ? err.message : err}`,
      );
    }
  }
  return {
    tools,
    close: async () => {
      await Promise.allSettled(clients.map((c) => c.close()));
    },
  };
}
