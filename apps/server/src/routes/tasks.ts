import { and, asc, desc, eq, lt } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { bots, taskEvents, tasks, type Task } from "@agentcall/db";
import type { Deps } from "../deps";
import { requireUser, type AuthVars } from "../lib/auth";
import { ApiError, errors, ok, validate } from "../lib/http";
import { getApiKey } from "../services/keys";
import { cancelTask } from "../worker/tasks";

export const publicTask = (t: Task) => ({
  id: t.id,
  botId: t.botId,
  source: t.source,
  status: t.status,
  prompt: t.prompt,
  repo: t.repo,
  result: t.result,
  error: t.error,
  createdAt: t.createdAt,
  startedAt: t.startedAt,
  finishedAt: t.finishedAt,
});

const idParam = z.object({ id: z.string().uuid("Unknown task.") });

export function taskRoutes(deps: Deps) {
  const own = (userId: string, id: string) => and(eq(tasks.id, id), eq(tasks.userId, userId));

  return new Hono<{ Variables: AuthVars }>()
    .use(requireUser(deps.db))
    .get(
      "/",
      validate(
        "query",
        z.object({
          botId: z.string().uuid().optional(),
          before: z.coerce.date().optional(),
          limit: z.coerce.number().int().min(1).max(100).default(30),
        }),
      ),
      async (c) => {
        const q = c.req.valid("query");
        const rows = await deps.db
          .select()
          .from(tasks)
          .where(
            and(
              eq(tasks.userId, c.get("user").id),
              q.botId ? eq(tasks.botId, q.botId) : undefined,
              q.before ? lt(tasks.createdAt, q.before) : undefined,
            ),
          )
          .orderBy(desc(tasks.createdAt))
          .limit(q.limit);
        return ok(c, { tasks: rows.map(publicTask) });
      },
    )
    .post(
      "/",
      validate(
        "json",
        z.object({
          botId: z.string().uuid("Pick a bot."),
          prompt: z.string().trim().min(1, "Describe the task.").max(8000),
          repo: z
            .string()
            .regex(/^[\w.-]+\/[\w.-]+$/, "Use owner/name.")
            .nullable()
            .optional(),
        }),
      ),
      async (c) => {
        const user = c.get("user");
        const input = c.req.valid("json");
        const [bot] = await deps.db
          .select()
          .from(bots)
          .where(and(eq(bots.id, input.botId), eq(bots.userId, user.id)))
          .limit(1);
        if (!bot) throw errors.notFound("Bot");
        if (!bot.enabled) throw errors.precondition("bot_disabled", `${bot.name} is paused. Turn it on first.`);
        // Preflight the keys the run needs, so a task never queues just to fail
        // in the worker seconds later.
        if (!(await getApiKey(deps, user.id, "opencode")))
          throw errors.precondition("opencode_missing", "Add your OpenCode API key in setup before handing over tasks.");
        if (!(await getApiKey(deps, user.id, "instabox")))
          throw errors.precondition("instabox_missing", "Add your instabox API key in setup before handing over tasks.");
        const [task] = await deps.db
          .insert(tasks)
          .values({
            userId: user.id,
            botId: bot.id,
            source: "dashboard",
            prompt: input.prompt,
            repo: input.repo ?? bot.repos[0] ?? null,
            slackChannelId: bot.slackChannelId,
          })
          .returning();
        return ok(c, { task: publicTask(task!) }, 201);
      },
    )
    .get("/:id", validate("param", idParam), async (c) => {
      const [task] = await deps.db.select().from(tasks).where(own(c.get("user").id, c.req.valid("param").id)).limit(1);
      if (!task) throw errors.notFound("Task");
      const events = await deps.db
        .select({ id: taskEvents.id, type: taskEvents.type, message: taskEvents.message, createdAt: taskEvents.createdAt })
        .from(taskEvents)
        .where(eq(taskEvents.taskId, task.id))
        .orderBy(asc(taskEvents.id))
        .limit(500);
      return ok(c, { task: publicTask(task), events });
    })
    .post("/:id/cancel", validate("param", idParam), async (c) => {
      const [task] = await deps.db.select().from(tasks).where(own(c.get("user").id, c.req.valid("param").id)).limit(1);
      if (!task) throw errors.notFound("Task");
      if (task.status !== "queued" && task.status !== "running") {
        throw new ApiError(409, "task_finished", "This task has already finished.");
      }
      await cancelTask(deps, task);
      return ok(c, { cancelled: true });
    });
}
