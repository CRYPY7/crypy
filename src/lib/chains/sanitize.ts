/**
 * Token names and symbols come from contracts anyone can deploy, so they are untrusted.
 * Scam tokens use names like "Visit claim-airdrop.xyz" or invisible/RTL control characters.
 * We strip control and formatting characters and cap the length. React escapes the rest.
 */
const CONTROL_AND_FORMAT = /[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁠-⁩﻿]/g;

export function sanitizeTokenText(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return "";
  const cleaned = value.replace(CONTROL_AND_FORMAT, "").replace(/\s+/g, " ").trim();
  return cleaned.length > maxLength ? `${cleaned.slice(0, maxLength - 1)}…` : cleaned;
}

/** True when a token name or symbol looks like a link — a common phishing trick. */
export function looksLikeLink(value: string): boolean {
  return /(https?:\/\/|www\.|\.[a-z]{2,6}(\/|\b))/i.test(value);
}
