use serde::Serialize;
use std::fs;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::Manager;

/// The newest plan backups this machine keeps (`write_plans_backup`) before
/// the oldest ones are pruned.
const MAX_PLAN_BACKUPS: usize = 20;

#[derive(Serialize)]
struct SnapshotInfo {
  file: String,
  #[serde(rename = "capturedAt")]
  captured_at: String,
}

/// `~/Library/Application Support/com.northstar.planner/monarch` on macOS —
/// the exact directory `scripts/monarch-sync.mjs` writes into
/// (`scripts/monarch-paths.mjs`'s `monarchDir()`), and the same one
/// `scripts/vite-monarch-plugin.ts` reads from for a plain browser dev tab.
/// All three have to agree on this path without ever importing from one
/// another, which is why each of them derives it independently rather than
/// one hard-coding a copy of another's constant.
fn monarch_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
  app
    .path()
    .app_data_dir()
    .map(|dir| dir.join("monarch"))
    .map_err(|e| e.to_string())
}

/// The latest local Monarch snapshot's raw JSON, or `None` when
/// `monarch-sync.mjs` has never been run (or the file is unreadable for any
/// other reason — this command reports absence, not a distinguishable error,
/// which is all the frontend (`src/planner/monarchLocal.ts`) needs: it treats
/// "no local backend" and "no snapshot yet" identically).
#[tauri::command]
fn monarch_latest_snapshot(app: tauri::AppHandle) -> Option<String> {
  let dir = monarch_dir(&app).ok()?;
  fs::read_to_string(dir.join("snapshots").join("latest.json")).ok()
}

/// Every local snapshot on disk (excluding `latest.json`, which is a copy of
/// whichever dated file is newest, not a capture of its own), newest first by
/// filename — `YYYY-MM-DD[-HHMM].json` sorts chronologically as a string.
#[tauri::command]
fn monarch_list_snapshots(app: tauri::AppHandle) -> Vec<SnapshotInfo> {
  let Ok(dir) = monarch_dir(&app) else {
    return Vec::new();
  };
  let Ok(entries) = fs::read_dir(dir.join("snapshots")) else {
    return Vec::new();
  };

  let mut snapshots: Vec<SnapshotInfo> = entries
    .filter_map(|entry| entry.ok())
    .filter_map(|entry| {
      let path = entry.path();
      let file = path.file_name()?.to_str()?.to_string();
      if file == "latest.json" || !file.ends_with(".json") {
        return None;
      }
      let contents = fs::read_to_string(&path).ok()?;
      let captured_at = serde_json::from_str::<serde_json::Value>(&contents)
        .ok()
        .and_then(|v| v.get("capturedAt")?.as_str().map(str::to_string))
        .unwrap_or_default();
      Some(SnapshotInfo { file, captured_at })
    })
    .collect();

  snapshots.sort_by(|a, b| b.file.cmp(&a.file));
  snapshots
}

/// A durable copy of every plan, written outside the webview's `localStorage`
/// (docs/ROADMAP-10.md Track B — "the webview's localStorage is never the
/// only copy"). `json` is the frontend's own serialization of `Plan[]`; this
/// command doesn't parse it, only stores and rotates it, so a future plan
/// shape change here needs no matching change on the Rust side.
#[tauri::command]
fn write_plans_backup(app: tauri::AppHandle, json: String) -> Result<(), String> {
  let dir = app
    .path()
    .app_data_dir()
    .map_err(|e| e.to_string())?
    .join("backups");
  fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

  let millis = SystemTime::now()
    .duration_since(UNIX_EPOCH)
    .map_err(|e| e.to_string())?
    .as_millis();
  fs::write(dir.join(format!("plans-{millis}.json")), json).map_err(|e| e.to_string())?;

  prune_old_backups(&dir)?;
  Ok(())
}

/// Keeps only the newest `MAX_PLAN_BACKUPS` files — the filename's embedded
/// millisecond timestamp sorts the same whether by name or by write time, so
/// a plain string sort is enough.
fn prune_old_backups(dir: &PathBuf) -> Result<(), String> {
  let mut files: Vec<PathBuf> = fs::read_dir(dir)
    .map_err(|e| e.to_string())?
    .filter_map(|entry| entry.ok())
    .map(|entry| entry.path())
    .filter(|path| path.extension().is_some_and(|ext| ext == "json"))
    .collect();
  files.sort();

  if files.len() > MAX_PLAN_BACKUPS {
    for old in &files[..files.len() - MAX_PLAN_BACKUPS] {
      let _ = fs::remove_file(old);
    }
  }
  Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    // Remembers window size/position/maximized state across launches
    // (docs/ROADMAP-10.md C6) — no per-window code needed beyond this:
    // the plugin attaches to every window Tauri creates and persists to
    // its own file in the app data dir.
    .plugin(tauri_plugin_window_state::Builder::default().build())
    .invoke_handler(tauri::generate_handler![
      monarch_latest_snapshot,
      monarch_list_snapshots,
      write_plans_backup
    ])
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
