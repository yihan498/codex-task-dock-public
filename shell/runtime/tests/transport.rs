use super::*;
#[test] fn agent_report_desktop_state_safe_projection() {
 let mut raw:serde_json::Value=serde_json::from_str(&body()).unwrap();
 raw["desktop"]=serde_json::json!({"status":"available","partial":true,"secret":"HIDDEN"});
 raw["snapshot"]["threads"][0]["desktopRuntime"]=serde_json::json!({"source":"desktop-ipc","threadId":"t","turnId":"u","state":"running","seenAt":1000000,"plan":[{"step":"核对来源","status":"in_progress"}],"secret":"HIDDEN"});
 let result=serde_json::to_value(parse_payload(&serde_json::to_vec(&raw).unwrap()).unwrap()).unwrap();
 assert_eq!(result["desktop"]["status"],"available");assert_eq!(result["desktop"]["partial"],true);assert_eq!(result["threads"][0]["desktopRuntime"]["state"],"running");assert!(!result.to_string().contains("HIDDEN"));
}
#[test] fn agent_report_native_projection_preserves_safe_steps_and_source() {
 let mut raw:serde_json::Value=serde_json::from_str(&body()).unwrap();
 raw["reporting"]=serde_json::json!({"status":"available","secret":"HIDDEN"});
 raw["snapshot"]["threads"][0]["agentReport"]=serde_json::json!({"source":"agent-report","threadId":"t","turnId":"u","runId":"r","seq":1,"state":"active","seenAt":1000000,"progressAt":900000,"fresh":true,"plan":[{"step":"核对来源","status":"in_progress","secret":"HIDDEN"}],"secret":"HIDDEN"});
 let result=serde_json::to_value(parse_payload(&serde_json::to_vec(&raw).unwrap()).unwrap()).unwrap();
 assert_eq!(result["reporting"]["status"],"available");assert_eq!(result["threads"][0]["agentReport"]["plan"][0]["step"],"核对来源");assert!(!result.to_string().contains("HIDDEN"));
}
#[test] fn agent_report_wrong_binding_and_multiple_current_steps_rejected() {
 for (id,n) in [("other",1),("t",2)] {
  let mut raw:serde_json::Value=serde_json::from_str(&body()).unwrap();
  raw["snapshot"]["threads"][0]["agentReport"]=serde_json::json!({"source":"agent-report","threadId":id,"turnId":"u","runId":"r","seq":1,"state":"active","seenAt":1000000,"progressAt":900000,"fresh":true,"plan":vec![serde_json::json!({"step":"x","status":"in_progress"});n]});
  let result=serde_json::to_value(parse_payload(&serde_json::to_vec(&raw).unwrap()).unwrap()).unwrap();assert!(result["threads"][0].get("agentReport").is_none());
 }
}
use std::{io::{Read, Write}, net::TcpListener, sync::mpsc, thread, time::Duration};

fn serve(response: String, delay: Duration) -> (String, mpsc::Receiver<String>) {
    let listener=TcpListener::bind("127.0.0.1:0").unwrap();
    let url=format!("http://{}/api/snapshot",listener.local_addr().unwrap());
    let (tx,rx)=mpsc::channel();
    thread::spawn(move || {
        let (mut stream,_)=listener.accept().unwrap();
        stream.set_read_timeout(Some(Duration::from_secs(2))).unwrap();
        let mut bytes=[0;4096]; let n=stream.read(&mut bytes).unwrap_or(0);
        tx.send(String::from_utf8_lossy(&bytes[..n]).into_owned()).ok();
        thread::sleep(delay); stream.write_all(response.as_bytes()).ok();
    });
    (url,rx)
}
fn body() -> String { r#"{"connection":"live","stale":false,"lastSuccessAt":"2026-08-31T00:00:00Z","snapshot":{"projects":[{"secret":"HIDDEN"}],"threads":[{"threadId":"t","title":"test","titleSource":"name","runtimeState":"notLoaded","updatedAt":1788134400,"cwd":"HIDDEN","conversationPreview":"HIDDEN","userFields":{"company":"HIDDEN"}}]}}"#.into() }
#[test] fn agent_report_content_name_projection_is_bound_and_minimal() {
 let mut raw:serde_json::Value=serde_json::from_str(&body()).unwrap();
 raw["snapshot"]["threads"][0]["desktopRuntime"]=serde_json::json!({"source":"desktop-ipc","threadId":"t","turnId":"u","state":"running","seenAt":1788134400000u64,"plan":[]});
 raw["snapshot"]["threads"][0]["displayName"]=serde_json::json!({"source":"reviewed-user-content","threadId":"t","turnId":"u","parts":[{"kind":"project","text":"X"},{"kind":"object","text":"账号冻结申诉"}],"body":"HIDDEN"});
 let parse=|r:&serde_json::Value|serde_json::to_value(parse_payload(&serde_json::to_vec(r).unwrap()).unwrap()).unwrap();
 let result=parse(&raw);assert_eq!(result["threads"][0]["displayName"]["parts"][1]["text"],"账号冻结申诉");assert!(!result.to_string().contains("HIDDEN"));
 raw["snapshot"]["threads"][0]["displayName"]["turnId"]="other".into();assert!(parse(&raw)["threads"][0].get("displayName").is_none());
}
#[test] fn agent_report_automatic_name_accepts_single_object_and_safe_status() {
 let mut raw:serde_json::Value=serde_json::from_str(&body()).unwrap();
 raw["snapshot"]["threads"][0]["desktopRuntime"]=serde_json::json!({"source":"desktop-ipc","threadId":"t","turnId":"u","state":"running","seenAt":1788134400000u64,"plan":[]});
 raw["snapshot"]["threads"][0]["displayName"]=serde_json::json!({"source":"local-user-keywords","threadId":"t","turnId":"u","parts":[{"kind":"object","text":"设备维护手册"}],"raw":"HIDDEN"});
 raw["snapshot"]["threads"][0]["nameStatus"]="ready".into();
 let parse=|r:&serde_json::Value|serde_json::to_value(parse_payload(&serde_json::to_vec(r).unwrap()).unwrap()).unwrap();
 let result=parse(&raw);assert_eq!(result["threads"][0]["displayName"]["parts"][0]["text"],"设备维护手册");assert_eq!(result["threads"][0]["nameStatus"],"ready");assert!(!result.to_string().contains("HIDDEN"));
 raw["snapshot"]["threads"][0]["nameStatus"]="HIDDEN".into();raw["snapshot"]["threads"][0]["displayName"]["turnId"]="other".into();let invalid=parse(&raw);assert!(invalid["threads"][0].get("displayName").is_none());assert!(invalid["threads"][0].get("nameStatus").is_none());
}
fn response(body:&str)->String {format!("HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",body.len(),body)}
#[test] fn agent_report_model_name_source_and_quota_status() {
 let mut raw:serde_json::Value=serde_json::from_str(&body()).unwrap();
 let t=&mut raw["snapshot"]["threads"][0];
 t["desktopRuntime"]=serde_json::json!({"source":"desktop-ipc","threadId":"t","turnId":"u","state":"running","seenAt":1788134400000u64,"plan":[]});
 t["displayName"]=serde_json::json!({"source":"model-user-content","threadId":"t","turnId":"u","parts":[{"kind":"object","text":"半年报"}],"evidence":"HIDDEN"});t["nameStatus"]="limited".into();
 let result=serde_json::to_value(parse_payload(&serde_json::to_vec(&raw).unwrap()).unwrap()).unwrap();
 assert_eq!(result["threads"][0]["displayName"]["source"],"model-user-content");assert_eq!(result["threads"][0]["nameStatus"],"limited");assert!(!result.to_string().contains("HIDDEN"));
}
#[test] fn agent_report_retained_model_name_preserves_previous_source_turn_without_exposing_extra_fields() {
 let mut raw:serde_json::Value=serde_json::from_str(&body()).unwrap();{
  let t=&mut raw["snapshot"]["threads"][0];t["desktopRuntime"]=serde_json::json!({"source":"desktop-ipc","threadId":"t","turnId":"u","state":"running","seenAt":1788134400000u64,"plan":[]});
  t["displayName"]=serde_json::json!({"source":"model-user-content-retained","threadId":"t","turnId":"u","sourceTurnId":"previous-u","parts":[{"kind":"project","text":"Codex Task Dock"},{"kind":"object","text":"当前任务和今日任务自动命名"}],"body":"HIDDEN"});t["nameStatus"]="unavailable".into();
 }
 let parse=|r:&serde_json::Value|serde_json::to_value(parse_payload(&serde_json::to_vec(r).unwrap()).unwrap()).unwrap();let result=parse(&raw);let name=&result["threads"][0]["displayName"];
 assert_eq!(name["source"],"model-user-content-retained");assert_eq!(name["sourceTurnId"],"previous-u");assert_eq!(name["turnId"],"u");assert!(!result.to_string().contains("HIDDEN"));
 raw["snapshot"]["threads"][0]["displayName"]["sourceTurnId"]="".into();assert!(parse(&raw)["threads"][0].get("displayName").is_none());
}
#[test] fn actual_get_and_nested_whitelist() {
 let (url,rx)=serve(response(&body()),Duration::ZERO);
 let data=fetch_from(&url,Duration::from_secs(2)).unwrap();
 assert!(rx.recv().unwrap().starts_with("GET /api/snapshot HTTP/1.1"));
 let value=serde_json::to_value(data).unwrap();
 assert_eq!(value["threads"][0]["title"],"test");
 assert_eq!(value["threads"][0]["runtimeState"],"notLoaded");
 assert_eq!(value["threads"][0].as_object().unwrap().len(),5);
 assert!(!value.to_string().contains("HIDDEN"));
}
#[test] fn business_projection_requires_bound_user_source() {
 let mut raw:serde_json::Value=serde_json::from_str(&body()).unwrap();
 raw["snapshot"]["threads"][0]["business"]=serde_json::json!({
  "company":{"value":"测试公司","source":{"sourceThreadId":"t","sourceTurnId":"u","sourceMessageId":"m"},"private":"HIDDEN"},
  "subject":{"value":"WRONG","source":{"sourceThreadId":"other","sourceTurnId":"u","sourceMessageId":"m"}},
  "assistantText":"HIDDEN"
 });
 let result=serde_json::to_value(parse_payload(&serde_json::to_vec(&raw).unwrap()).unwrap()).unwrap();
 assert_eq!(result["threads"][0]["business"]["company"]["value"],"测试公司");
 assert!(result["threads"][0]["business"].get("subject").is_none());
 assert!(!result.to_string().contains("HIDDEN"));
}
#[test] fn business_deadline_requires_real_calendar_date() {
 for (value,valid) in [("2026-02-30T18:00:00+08:00",false),("2026-08-31T24:00:00+08:00",false),
  ("2026-08-31T18:00:00+00:60",false),("2024-02-29T18:00:00+08:00",true)] {
  let mut raw:serde_json::Value=serde_json::from_str(&body()).unwrap();
  raw["snapshot"]["threads"][0]["business"]=serde_json::json!({"deadline":{"value":value,
   "source":{"sourceThreadId":"t","sourceTurnId":"u","sourceMessageId":"m"},
   "basis":{"type":"explicit","timeZone":"Asia/Shanghai"}}});
  let result=serde_json::to_value(parse_payload(&serde_json::to_vec(&raw).unwrap()).unwrap()).unwrap();
  assert_eq!(result["threads"][0]["business"].get("deadline").is_some(),valid,"{value}");
 }
}
#[test] fn initial_without_snapshot_is_not_successful_empty() {
 let data=parse_payload(br#"{"connection":"connecting","stale":false}"#).unwrap();
 assert!(data.threads.is_none());
 let data=parse_payload(br#"{"connection":"live","stale":false,"snapshot":{"threads":[]}}"#).unwrap();
 assert_eq!(data.threads.unwrap().len(),0);
}
#[test] fn stale_survives_success_and_missing_title_source_is_unknown() {
 let data=parse_payload(br#"{"connection":"disconnected","stale":true,"snapshot":{"threads":[{"threadId":"t","title":"test","runtimeState":"notLoaded"}]}}"#).unwrap();
 assert!(data.stale);
 assert_eq!(data.threads.unwrap()[0].title_source,"unknown");
}
#[test] fn rejects_invalid_json_and_schema() {
 for bytes in [b"not json".as_slice(),br#"{}"#,br#"{"connection":"evil","stale":false}"#,br#"{"connection":"live","stale":false,"snapshot":{"threads":[{"threadId":7}]}}"#] {assert!(parse_payload(bytes).is_err());}
}
#[test] fn no_content_length_still_enforces_streaming_limit() {
 let data="x".repeat(MAX_BYTES+8);
 let (url,_)=serve(format!("HTTP/1.1 200 OK\r\nConnection: close\r\n\r\n{}",data),Duration::ZERO);
 assert_eq!(fetch_from(&url,Duration::from_secs(2)).unwrap_err(),"snapshot_too_large");
}
#[test] fn bounded_reader_reads_at_most_limit_plus_one() {
 let mut reader=std::io::Cursor::new(vec![0;MAX_BYTES+999]);
 assert_eq!(read_bounded(&mut reader).unwrap_err(),"snapshot_too_large");
 assert_eq!(reader.position(),(MAX_BYTES+1) as u64);
}
#[test] fn rejects_non_success_and_redirect_without_following() {
 for status in ["503 Unavailable","302 Found"] {
  let (url,_)=serve(format!("HTTP/1.1 {}\r\nLocation: http://127.0.0.1:1/forbidden\r\nContent-Length: 0\r\n\r\n",status),Duration::ZERO);
  assert_eq!(fetch_from(&url,Duration::from_secs(2)).unwrap_err(),"snapshot_http_status");
 }
}
#[test] fn timeout_does_not_wait_for_response() {
 let (url,_)=serve(response(&body()),Duration::from_millis(300));
 assert_eq!(fetch_from(&url,Duration::from_millis(50)).unwrap_err(),"snapshot_unavailable");
}
#[test] fn command_origin_must_be_local_main_exactly() {
 for url in ["http://tauri.localhost/","https://tauri.localhost/index.html","tauri://localhost/index.html"] {
  assert!(trusted_caller("main",&tauri::Url::parse(url).unwrap()));
  assert!(!trusted_caller("other",&tauri::Url::parse(url).unwrap()));
 }
 for url in ["https://tauri.localhost.evil/","http://tauri.localhost:4317/","http://127.0.0.1:4317/","file:///etc/passwd","https://evil/"] {
  assert!(!trusted_caller("main",&tauri::Url::parse(url).unwrap()));
 }
}
#[test] #[ignore = "explicit read-only real collector probe"]
fn real_collector_probe() {
 let data=fetch_snapshot().unwrap();
 let threads=data.threads.unwrap_or_default();
 let named=threads.iter().filter(|t|t.title_source=="name").count();
 println!("REAL_BRIDGE_COUNT={} NAMED={} STALE={}",threads.len(),named,data.stale);
}
