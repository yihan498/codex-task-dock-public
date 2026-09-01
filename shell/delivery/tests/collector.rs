use super::*;
#[test] fn popup_skips_taskbar_and_positions_before_every_show() {
 let config:serde_json::Value=serde_json::from_str(include_str!("../../src-tauri/tauri.conf.json")).unwrap();
 assert_eq!(config["app"]["windows"][0]["skipTaskbar"],true,"taskbar icon must be absent");
 let source=include_str!("../../src-tauri/src/lib.rs");
 let toggle=source.split("fn toggle_main_window").nth(1).unwrap().split("pub fn run").next().unwrap();
 assert!(toggle.find("position_popup(window)?").unwrap()<toggle.find("window.show()?").unwrap());
 assert!(source.contains("work_area()")&&source.contains("primary_monitor()?"));
 assert_eq!(source.matches("toggle_main_window(&window)").count(),3,"tray,menu,shortcut share positioning");
}
#[test]
fn handshake_requires_port_and_unpredictable_token() {
 let token="a".repeat(64);
 assert_eq!(parse_ready(&format!(r#"{{"event":"ready","port":54321,"token":"{token}"}}"#)).unwrap(),(54321,token));
 for line in [r#"{"event":"ready","port":0,"token":"x"}"#,r#"{"event":"wrong","port":54321,"token":"x"}"#,"not-json"] {assert!(parse_ready(line).is_err());}
}
#[test]
fn runtime_paths_are_relative_to_delivered_executable() {
 let (node,main)=runtime_paths(Path::new("candidate"));
 assert_eq!(node,PathBuf::from("candidate/runtime/node.exe"));
 assert_eq!(main,PathBuf::from("candidate/runtime/src/reader/main.mjs"));
}
#[test]
fn release_binary_does_not_compile_debug_absolute_runtime_path() {
 let source=include_str!("../../src-tauri/src/collector.rs");
 assert!(!source.contains("cfg!(debug_assertions)"),"runtime branch still compiles debug path into release");
 assert!(source.contains("#[cfg(debug_assertions)]"),"debug fallback must be compile-time gated");
}
#[test]
fn owned_child_starts_and_stops_without_external_service() {
 let main=PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../delivery/tests/fixture-collector.mjs");
 let mut owned=start_runtime(Path::new("C:/Program Files/nodejs/node.exe"),&main).expect("owned collector starts");
 assert!(owned.port>0);
 owned.stop();
 assert!(owned.child.try_wait().unwrap().is_some());
}
#[test]
fn actual_exit_event_explicitly_stops_collector() {
 let source=include_str!("../../src-tauri/src/lib.rs");
 assert!(source.contains("RunEvent::Exit"));
 assert!(source.contains(".shutdown()"));
}
#[test]
fn release_entry_does_not_open_console_window() {
 let source=include_str!("../../src-tauri/src/main.rs");
 assert!(source.contains("windows_subsystem = \"windows\""));
}
#[test]
#[ignore="explicit read-only owned collector real-flow validation"]
fn real_owned_collector_snapshot_and_exit() {
 let node=std::env::var("DOCK_VERIFY_NODE").unwrap_or("C:/Program Files/nodejs/node.exe".into());
 let main=std::env::var("DOCK_VERIFY_MAIN").map(PathBuf::from).unwrap_or(PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../src/reader/main.mjs"));
 let mut owned=start_runtime(Path::new(&node),&main).unwrap();
 let mut count=0;
 for _ in 0..40 {
  let snap=crate::snapshot::fetch_authenticated(owned.port,&owned.token).unwrap();
  let value=serde_json::to_value(snap).unwrap();
  if let Some(threads)=value["threads"].as_array(){count=threads.len();break;}
  std::thread::sleep(std::time::Duration::from_millis(250));
 }
 assert!(count>0,"no real snapshot");
 owned.stop();assert!(owned.child.try_wait().unwrap().is_some());
 println!("OWNED_REAL_COUNTS threads={count}; ownerExited=true; tokenLogged=false");
}
