#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
fn main() {
    std::process::exit(codex_task_dock_shell::run());
}
