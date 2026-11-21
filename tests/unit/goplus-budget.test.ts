import { beforeEach, describe, expect, it } from "vitest";
import {
  BACKGROUND_PER_MINUTE,
  PER_MINUTE,
  isLimitMessage,
  pauseGoPlus,
  resetGoPlusPace,
  takeGoPlusSlot,
} from "@/server/security/goplus-budget";

describe("GoPlus pace", () => {
  beforeEach(() => resetGoPlusPace());

  it("background checks use only their share; page reports keep the rest", () => {
    const now = 1_000_000;
    for (let i = 0; i < BACKGROUND_PER_MINUTE; i++) expect(takeGoPlusSlot("background", now)).toBe(true);
    expect(takeGoPlusSlot("background", now)).toBe(false);
    for (let i = BACKGROUND_PER_MINUTE; i < PER_MINUTE; i++) expect(takeGoPlusSlot("page", now)).toBe(true);
    expect(takeGoPlusSlot("page", now)).toBe(false);
  });

  it("page reports go first: once they fill the background share, background waits", () => {
    const now = 1_000_000;
    for (let i = 0; i < BACKGROUND_PER_MINUTE; i++) takeGoPlusSlot("page", now);
    expect(takeGoPlusSlot("background", now)).toBe(false);
    expect(takeGoPlusSlot("page", now)).toBe(true);
  });

  it("a new minute starts fresh", () => {
    for (let i = 0; i < PER_MINUTE; i++) takeGoPlusSlot("page", 0 + 1);
    expect(takeGoPlusSlot("page", 1)).toBe(false);
    expect(takeGoPlusSlot("background", 60_001)).toBe(true);
  });

  it("pauses everyone after GoPlus says too many requests", () => {
    pauseGoPlus(5_000);
    expect(takeGoPlusSlot("page", 5_001)).toBe(false);
    expect(takeGoPlusSlot("page", 65_001)).toBe(true);
  });

  it("recognises limit messages", () => {
    expect(isLimitMessage("request limit reached")).toBe(true);
    expect(isLimitMessage("Too many requests")).toBe(true);
    expect(isLimitMessage("OK")).toBe(false);
    expect(isLimitMessage(undefined)).toBe(false);
  });
});
