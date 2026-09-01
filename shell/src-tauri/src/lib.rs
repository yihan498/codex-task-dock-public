use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager, WebviewWindow, WindowEvent,
};
use tauri_plugin_global_shortcut::ShortcutState;
mod snapshot;
mod collector;
mod navigation;
mod placement;
mod single_instance;

fn check_caller(window: &WebviewWindow) -> Result<(), &'static str> {
    let url = window.url().map_err(|_| "untrusted_window")?;
    if snapshot::trusted_caller(window.label(), &url) {
        Ok(())
    } else {
        Err("untrusted_window")
    }
}

#[tauri::command]
async fn fetch_task_snapshot(window: WebviewWindow, state: tauri::State<'_, std::sync::Arc<collector::CollectorState>>) -> Result<snapshot::Snapshot, &'static str> {
    check_caller(&window)?;
    let collector = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let (port, token) = collector.endpoint()?;
        snapshot::fetch_authenticated(port, &token)
    })
        .await
        .map_err(|_| "snapshot_unavailable")?
}

#[tauri::command]
fn hide_dock(window: WebviewWindow) -> Result<(), &'static str> {
    check_caller(&window)?;
    window.hide().map_err(|_| "hide_failed")
}
#[tauri::command]
async fn open_codex_task(window: WebviewWindow, state: tauri::State<'_, std::sync::Arc<collector::CollectorState>>, thread_id: String) -> Result<(), &'static str> {
    check_caller(&window)?;
    navigation::thread_uri(&thread_id)?;
    let collector = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let (port, token) = collector.endpoint()?;
        let snapshot = snapshot::fetch_authenticated(port, &token)?;
        if !snapshot.contains_thread(&thread_id) { return Err("task_not_in_snapshot"); }
        navigation::open_thread(&thread_id)
    }).await.map_err(|_| "codex_open_failed")?
}

const DEFAULT_SHORTCUT: &str = "CommandOrControl+Shift+D";

fn position_popup(window: &WebviewWindow) -> tauri::Result<()> {
    let monitor = window.primary_monitor()?.or(window.current_monitor()?).ok_or_else(||
        std::io::Error::new(std::io::ErrorKind::NotFound, "no monitor work area"))?;
    let area = monitor.work_area();
    let scale = monitor.scale_factor();
    // Move to the target monitor while hidden, then measure its actual DPI-adjusted frame.
    window.set_position(area.position)?;
    let outer = window.outer_size()?;
    let inner = window.inner_size()?;
    let fitted = placement::fit_inner((area.size.width,area.size.height),
        (outer.width,outer.height),(inner.width,inner.height),scale);
    if fitted != (inner.width,inner.height) {
        window.set_size(tauri::PhysicalSize::new(fitted.0,fitted.1))?;
    }
    let outer = window.outer_size()?;
    let (x,y) = placement::bottom_right((area.position.x,area.position.y),
        (area.size.width,area.size.height),(outer.width,outer.height),scale);
    window.set_position(tauri::PhysicalPosition::new(x,y))?;
    Ok(())
}

fn toggle_main_window(window: &WebviewWindow) -> tauri::Result<()> {
    if window.is_visible()? {
        window.hide()?;
    } else {
        window.set_skip_taskbar(true)?;
        position_popup(window)?;
        window.show()?;
        window.set_focus()?;
    }
    Ok(())
}

pub fn run() -> i32 {
    // Acquire before the webview, shortcut, tray or collector is created.
    let _instance_guard = match single_instance::startup() {
        Ok(Some(guard)) => guard,
        Ok(None) => return 0,
        Err(code) => return code,
    };
    let configured_shortcut =
        std::env::var("CODEX_TASK_DOCK_SHORTCUT").unwrap_or_else(|_| DEFAULT_SHORTCUT.to_owned());

    tauri::Builder::default()
        .manage(std::sync::Arc::new(collector::CollectorState::default()))
        .invoke_handler(tauri::generate_handler![fetch_task_snapshot, hide_dock, open_codex_task])
        .setup(move |app| {
            app.handle().plugin(
                tauri_plugin_global_shortcut::Builder::new()
                    .with_shortcuts([configured_shortcut.as_str()])?
                    .with_handler(|app, _shortcut, event| {
                        if event.state() == ShortcutState::Pressed {
                            if let Some(window) = app.get_webview_window("main") {
                                if toggle_main_window(&window).is_err() {
                                    eprintln!("dock: shortcut visibility change failed");
                                }
                            }
                        }
                    })
                    .build(),
            )?;

            let icon = app.default_window_icon().cloned().ok_or_else(|| {
                std::io::Error::new(std::io::ErrorKind::NotFound, "Dock tray icon missing")
            })?;
            let toggle = MenuItem::with_id(app, "toggle-dock", "显示 / 隐藏", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit-dock", "退出任务浮窗", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&toggle, &quit])?;

            TrayIconBuilder::new()
                .icon(icon)
                .menu(&menu)
                .show_menu_on_left_click(false)
                .tooltip("Codex Task Dock — 本机只读")
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "toggle-dock" => {
                        if let Some(window) = app.get_webview_window("main") {
                            if toggle_main_window(&window).is_err() {
                                eprintln!("dock: menu visibility change failed");
                            }
                        }
                    }
                    "quit-dock" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if matches!(
                        event,
                        TrayIconEvent::Click {
                            button: MouseButton::Left,
                            button_state: MouseButtonState::Up,
                            ..
                        }
                    ) {
                        if let Some(window) = tray.app_handle().get_webview_window("main") {
                            if toggle_main_window(&window).is_err() {
                                eprintln!("dock: tray visibility change failed");
                            }
                        }
                    }
                })
                .build(app)?;
            Ok(())
        })
        .on_window_event(|window, event| {
            if window.label() == "main" {
                if let WindowEvent::CloseRequested { api, .. } = event {
                    // Keep the webview alive so the tray and shortcut can restore it.
                    api.prevent_close();
                    if window.hide().is_err() {
                        eprintln!("dock: close-to-tray hide failed; window preserved");
                    }
                }
            }
        })
        .build(tauri::generate_context!())
        .expect("Codex Task Dock shell failed")
        .run(|app, event| {
            if matches!(event, tauri::RunEvent::Exit) {
                app.state::<std::sync::Arc<collector::CollectorState>>().shutdown();
            }
        });
    0
}
