import "server-only";
import type { OutcomeTool } from "@/lib/outcomes/classify";
import { notifyAdmins } from "@/server/health/notify";
import messages from "../../../messages/en.json";
import { ALERT_WINDOW_MS, outcomeTransitions, outcomesSince, saveOutcomes } from "./store";

/** Start time of each tool's current problem, in the worker's memory (one message per problem, one when fixed). */
const key = Symbol.for("crypy.visitorOutcomeProblems");
const holder = globalThis as unknown as Record<symbol, Map<OutcomeTool, number> | undefined>;
const failingSince: Map<OutcomeTool, number> = (holder[key] ??= new Map());

const toolNames = messages.admin.outcomes.tools as Record<string, string>;

/**
 * Worker job, every minute: saves this process's counts, then tells the owner (Telegram, admin wallets only) when a
 * tool starts failing for visitors (over 2% of requests in 10 minutes, at least 3 errors) and when it recovers.
 */
export async function watchVisitorOutcomes(now = Date.now()): Promise<number> {
  await saveOutcomes();
  const window = await outcomesSince(now - ALERT_WINDOW_MS);
  const found = outcomeTransitions(window, failingSince, now);
  if (!found.length) return 0;
  return notifyAdmins(
    found.map((t) => ({
      check: `visitors:${t.tool}`,
      kind: t.kind,
      detail: t.reason,
      minutes: t.minutes,
      what: `fails for visitors: ${t.errors} of ${t.total} requests in the last 10 minutes.`,
    })),
    (check) => toolNames[check.slice("visitors:".length)] ?? check,
  );
}
