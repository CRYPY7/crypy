"use client";

import { lazy, Suspense, useEffect, useState } from "react";
import { OPEN_TOOLS_EVENT } from "./open-tools";
import type { ToolsDialogProps } from "./tools-dialog";

// The dialog (and its UI library) is downloaded only the first time someone opens it.
const ToolsDialog = lazy(() => import("./tools-dialog").then((m) => ({ default: m.ToolsDialog })));

/** Tiny always-loaded part: listens for the All tools button and Ctrl/Cmd + K. */
export function ToolsDialogLoader(props: Omit<ToolsDialogProps, "open" | "onOpenChange">) {
  const [open, setOpen] = useState(false);
  const [requested, setRequested] = useState(false);

  useEffect(() => {
    const show = () => {
      setRequested(true);
      setOpen(true);
    };
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setRequested(true);
        setOpen((value) => !value);
      }
    };
    window.addEventListener(OPEN_TOOLS_EVENT, show);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener(OPEN_TOOLS_EVENT, show);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  if (!requested) return null;
  return (
    <Suspense fallback={null}>
      <ToolsDialog {...props} open={open} onOpenChange={setOpen} />
    </Suspense>
  );
}
