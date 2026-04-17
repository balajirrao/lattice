import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import * as api from "./api";

type Props = {
  recentVaults: string[];
  onVaultSelected: (path: string) => void;
};

export function VaultPicker({ recentVaults, onVaultSelected }: Props) {
  const [manualPath, setManualPath] = useState("");
  const [error, setError] = useState<string | null>(null);

  const selectVault = async (path: string) => {
    const p = path.trim();
    if (!p) return;
    try {
      await api.setVault(p);
      onVaultSelected(p);
    } catch (e) {
      setError(String(e));
    }
  };

  const browsePicker = async () => {
    const selected = await open({ directory: true, multiple: false });
    if (typeof selected === "string") await selectVault(selected);
  };

  return (
    <div className="vault-picker">
      <div className="vault-picker-card">
        <h1>lattice</h1>
        <p>Choose a folder to store your notes (markdown files).</p>
        <button className="btn-primary" onClick={browsePicker}>
          Browse…
        </button>
        <div className="vault-divider">or enter path manually</div>
        <div className="vault-manual">
          <input
            type="text"
            placeholder="~/notes"
            value={manualPath}
            onChange={(e) => setManualPath(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") selectVault(manualPath);
            }}
          />
          <button onClick={() => selectVault(manualPath)} disabled={!manualPath.trim()}>
            Open
          </button>
        </div>
        {error && <p className="vault-error">{error}</p>}
        {recentVaults.length > 0 && (
          <div className="vault-recent">
            <h4>Recent vaults</h4>
            <ul>
              {recentVaults.map((v) => (
                <li key={v}>
                  <button onClick={() => selectVault(v)}>{v}</button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
