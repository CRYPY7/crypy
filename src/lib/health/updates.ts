import { z } from "zod";
import { statusComponents } from "./checks";

/**
 * Status updates on the public status page (M9 Part 5): written by an admin, plain text only. Shared by the admin form
 * (limits) and the server (validation).
 */
export const updateStates = ["ongoing", "fixed", "planned"] as const;
export type UpdateState = (typeof updateStates)[number];

export const TITLE_MAX = 120;
export const BODY_MAX = 1_000;
/** Fixed updates stay on the public page this long. */
export const SHOW_FIXED_DAYS = 90;

const componentIds = statusComponents.map((c) => c.id) as [string, ...string[]];

/** Removes control, invisible and direction-changing characters; keeps line breaks in the body. */
export function cleanText(value: string, keepLines: boolean): string {
  const cleaned = value
    .replace(/[​-‏‪-‮⁦-⁩﻿]/g, "")
    .replace(keepLines ? /[\u0000-\u0009\u000B-\u001F\u007F]/g : /[\u0000-\u001F\u007F]/g, "")
    .replace(/\r\n?/g, "\n");
  return (keepLines ? cleaned.replace(/\n{3,}/g, "\n\n") : cleaned.replace(/\s+/g, " ")).trim();
}

export const newUpdateSchema = z.object({
  title: z
    .string()
    .transform((v) => cleanText(v, false))
    .pipe(z.string().min(3).max(TITLE_MAX)),
  body: z
    .string()
    .transform((v) => cleanText(v, true))
    .pipe(z.string().min(3).max(BODY_MAX)),
  state: z.enum(updateStates),
  component: z.enum(componentIds).nullable(),
});
export type NewUpdate = z.infer<typeof newUpdateSchema>;

export const changeUpdateSchema = z.object({ state: z.enum(updateStates) });

export interface StatusUpdate {
  id: string;
  title: string;
  body: string;
  state: UpdateState;
  component: string | null;
  createdAt: string;
  updatedAt: string;
  fixedAt: string | null;
}
