// Next.js runs this once when the server process starts.
// We use it to kick off the background message poller (Node runtime only).
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startCommsPoller } = await import("./lib/poller");
    startCommsPoller();
  }
}
