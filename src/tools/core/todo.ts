import { z } from "zod";
import type { CycodeTool } from "../types.js";

export const todoTool: CycodeTool<{
  todos: { content: string; status: "pending" | "in_progress" | "completed" }[];
}> = {
  name: "todo_write",
  description:
    "Replace the session todo list. Use for multi-step tasks: mark the current item " +
    "in_progress before starting it and completed immediately after finishing.",
  inputSchema: z.object({
    todos: z.array(
      z.object({
        content: z.string(),
        status: z.enum(["pending", "in_progress", "completed"]),
      }),
    ),
  }),
  readOnly: true,
  describeCall: (i) => `todo_write(${i.todos.length} items)`,
  async execute(input, ctx) {
    ctx.todos.splice(0, ctx.todos.length, ...input.todos);
    ctx.emit({ type: "todos", todos: [...input.todos] });
    const done = input.todos.filter((t) => t.status === "completed").length;
    return `Todo list updated (${done}/${input.todos.length} completed)`;
  },
};
