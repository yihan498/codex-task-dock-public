fn main() {
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&["fetch_task_snapshot", "hide_dock", "open_codex_task"]),
    ))
    .expect("failed to build dock command permissions");
}
