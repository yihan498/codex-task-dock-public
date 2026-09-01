use super::*;
#[test] fn original_task_command_has_local_main_only_permission() {
 let build=include_str!("../../src-tauri/build.rs");
 let acl:serde_json::Value=serde_json::from_str(include_str!("../../src-tauri/capabilities/main.json")).unwrap();
 assert!(build.contains("\"open_codex_task\""),"command missing from app manifest");
 assert_eq!(acl["windows"],serde_json::json!(["main"]));
 assert!(acl.get("remote").is_none());
 assert_eq!(acl["permissions"],serde_json::json!(["allow-fetch-task-snapshot","allow-hide-dock","allow-open-codex-task"]));
 let generated:serde_json::Value=serde_json::from_str(include_str!("../../src-tauri/gen/schemas/acl-manifests.json")).unwrap();
 assert_eq!(generated["__app-acl__"]["permissions"]["allow-open-codex-task"]["commands"]["allow"],serde_json::json!(["open_codex_task"]));
}
#[test] fn thread_link_is_exact_and_never_accepts_commands() {
 let id="01a00000-0000-7000-8000-000000000001";
 assert_eq!(thread_uri(id).unwrap(),format!("codex://threads/{id}"));
 for value in ["new","../settings","x?prompt=run","https://evil","01a00000-0000-7000-8000-000000000001#x"]{assert!(thread_uri(value).is_err());}
}
