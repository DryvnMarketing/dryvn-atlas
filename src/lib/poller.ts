import { runCommsCycle } from "./comms-engine";
import { logActivity } from "./db";

// Background message poller. Runs the (cheap) comms cycle on an interval while
// Atlas is running, so new Freelancer messages sync and get drafted without
// anyone clicking "Sync now". Drafting only calls Claude when there's actually
// a new inbound message, so idle polls are effectively free.
const DEFAULT_MS = 5 * 60 * 1000; // 5 minutes

export function startCommsPoller() {
  const g = globalThis as unknown as { __atlasCommsPoller?: NodeJS.Timeout };
  if (g.__atlasCommsPoller) return; // survive HMR / double-register

  const ms = Number(process.env.ATLAS_COMMS_POLL_MS ?? DEFAULT_MS);
  if (!ms || ms <= 0) return; // set ATLAS_COMMS_POLL_MS=0 to disable

  let busy = false;
  const tick = async () => {
    if (busy) return; // never overlap a run
    busy = true;
    try {
      await runCommsCycle();
    } catch (err) {
      logActivity("comms", "poll_error", String(err).slice(0, 160));
    } finally {
      busy = false;
    }
  };

  g.__atlasCommsPoller = setInterval(tick, ms);
  logActivity("comms", "poller_started", `Auto-sync every ${Math.round(ms / 60000)} min`);
  setTimeout(tick, 8000); // first sync shortly after boot
}
