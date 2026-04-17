import { invoke } from "@tauri-apps/api/core";

// ── config / vault ───────────────────────────────────────────────────────────

export interface Config {
  current_vault: string | null;
  recent_vaults: string[];
}

export const getConfig = () => invoke<Config>("get_config");
export const setVault = (path: string) => invoke<Config>("cmd_set_vault", { path });
export const getVaultPath = () => invoke<string | null>("get_vault_path");

// ── notes CRUD ───────────────────────────────────────────────────────────────

export const listNotes = () => invoke<string[]>("list_notes");
export const readNote = (title: string) =>
  invoke<{ title: string; content: string }>("read_note", { title });
export const writeNote = (title: string, content: string) =>
  invoke<void>("write_note", { title, content });
export const deleteNote = (title: string) => invoke<void>("delete_note", { title });
export const renameNote = (oldTitle: string, newTitle: string) =>
  invoke<void>("rename_note", { oldTitle, newTitle });

// ── discovery ────────────────────────────────────────────────────────────────

export interface SearchResult {
  title: string;
  excerpt: string;
}

export const searchNotes = (query: string) =>
  invoke<SearchResult[]>("search_notes", { query });
export const getBacklinks = (title: string) =>
  invoke<string[]>("get_backlinks", { title });

// ── favorites ────────────────────────────────────────────────────────────────

export const getFavorites = () => invoke<string[]>("get_favorites");
export const setFavorites = (favorites: string[]) =>
  invoke<void>("set_favorites", { favorites });
