import { useEffect, useState } from "react";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

export type UpdateStatus =
  | { kind: "idle" }
  | { kind: "available"; update: Update }
  | { kind: "downloading"; update: Update }
  | { kind: "ready" }
  | { kind: "error"; error: string };

/**
 * Check for updates on mount. Exposes the current status plus an `install`
 * trigger the UI calls once the user opts in. Runs once per app launch;
 * silent on failure so a dev run (no update endpoint reachable) stays quiet.
 */
export function useAutoUpdate(): {
  status: UpdateStatus;
  install: () => Promise<void>;
  dismiss: () => void;
} {
  const [status, setStatus] = useState<UpdateStatus>({ kind: "idle" });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const update = await check();
        if (cancelled || !update) return;
        setStatus({ kind: "available", update });
      } catch (e) {
        console.warn("update check failed", e);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const install = async () => {
    if (status.kind !== "available") return;
    const update = status.update;
    setStatus({ kind: "downloading", update });
    try {
      await update.downloadAndInstall();
      setStatus({ kind: "ready" });
      await relaunch();
    } catch (e) {
      setStatus({ kind: "error", error: String(e) });
    }
  };

  const dismiss = () => setStatus({ kind: "idle" });

  return { status, install, dismiss };
}
