#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod config;
mod notes;

use std::path::PathBuf;
use std::sync::Mutex;

use notes::{Note, NoteError, Notes, SearchResult};
use tauri::{Manager, State};

struct AppState {
    vault: Mutex<Option<PathBuf>>,
}

impl AppState {
    fn notes(&self) -> Result<Notes, String> {
        let guard = self.vault.lock().unwrap();
        let path = guard.as_ref().ok_or("no vault configured")?.clone();
        Ok(Notes::open(path))
    }
}

// ── config / vault ──────────────────────────────────────────────────────────

#[tauri::command]
fn get_config() -> config::Config {
    config::load()
}

#[tauri::command]
fn cmd_set_vault(state: State<'_, AppState>, path: String) -> Result<config::Config, String> {
    let cfg = config::set_vault(&path).map_err(|e| e.to_string())?;
    Notes::new(&path).map_err(|e| e.to_string())?;
    *state.vault.lock().unwrap() = Some(PathBuf::from(&path));
    Ok(cfg)
}

#[tauri::command]
fn get_vault_path(state: State<'_, AppState>) -> Option<String> {
    state
        .vault
        .lock()
        .unwrap()
        .as_ref()
        .map(|p| p.to_string_lossy().to_string())
}

// ── notes CRUD ───────────────────────────────────────────────────────────────

#[tauri::command]
fn list_notes(state: State<'_, AppState>) -> Result<Vec<String>, String> {
    state.notes()?.list().map_err(|e| e.to_string())
}

#[tauri::command]
fn read_note(state: State<'_, AppState>, title: String) -> Result<Note, NoteError> {
    state.notes().map_err(|e| NoteError::InvalidTitle(e))?.read(&title)
}

#[tauri::command]
fn write_note(state: State<'_, AppState>, title: String, content: String) -> Result<(), NoteError> {
    state.notes().map_err(|e| NoteError::InvalidTitle(e))?.write(&title, &content)
}

#[tauri::command]
fn delete_note(state: State<'_, AppState>, title: String) -> Result<(), NoteError> {
    state.notes().map_err(|e| NoteError::InvalidTitle(e))?.delete(&title)
}

#[tauri::command]
fn rename_note(
    state: State<'_, AppState>,
    old_title: String,
    new_title: String,
) -> Result<(), NoteError> {
    state
        .notes()
        .map_err(|e| NoteError::InvalidTitle(e))?
        .rename(&old_title, &new_title)
}

// ── discovery ────────────────────────────────────────────────────────────────

#[tauri::command]
fn search_notes(
    state: State<'_, AppState>,
    query: String,
) -> Result<Vec<SearchResult>, String> {
    state.notes()?.search(&query).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_backlinks(state: State<'_, AppState>, title: String) -> Result<Vec<String>, String> {
    state.notes()?.backlinks(&title).map_err(|e| e.to_string())
}

// ── favorites ────────────────────────────────────────────────────────────────

#[tauri::command]
fn get_favorites(state: State<'_, AppState>) -> Result<Vec<String>, String> {
    Ok(state.notes()?.get_favorites())
}

#[tauri::command]
fn set_favorites(
    state: State<'_, AppState>,
    favorites: Vec<String>,
) -> Result<(), String> {
    state
        .notes()?
        .set_favorites(&favorites)
        .map_err(|e| e.to_string())
}

// ── main ─────────────────────────────────────────────────────────────────────

fn main() {
    let cfg = config::load();
    let initial_vault: Option<PathBuf> = cfg
        .current_vault
        .filter(|p| std::path::Path::new(p).is_dir())
        .map(PathBuf::from);

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .manage(AppState {
            vault: Mutex::new(initial_vault),
        })
        .invoke_handler(tauri::generate_handler![
            get_config,
            cmd_set_vault,
            get_vault_path,
            list_notes,
            read_note,
            write_note,
            delete_note,
            rename_note,
            search_notes,
            get_backlinks,
            get_favorites,
            set_favorites,
        ])
        .setup(|app| {
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.set_title("Lattice");
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
