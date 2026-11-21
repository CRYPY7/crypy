import "server-only";

/**
 * Releases a response we won't read (an error status, a 404, a body that is too large). An unread body keeps its
 * connection open until the socket's idle timer fires, and Node then reports that as an uncaught error
 * ("socket idle timeout", seen in the owner's test runs). Cancelling the body closes it cleanly.
 */
export function discardBody(response: Response): void {
  response.body?.cancel().catch(() => {});
}
