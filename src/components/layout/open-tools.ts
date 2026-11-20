export const OPEN_TOOLS_EVENT = "crypy:open-tools";

/** Opens the All tools dialog from anywhere without sharing React state. */
export function openToolsDialog() {
  window.dispatchEvent(new Event(OPEN_TOOLS_EVENT));
}
