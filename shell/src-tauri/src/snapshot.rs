use serde::{Deserialize, Serialize};
use std::{io::Read, time::Duration};

const SNAPSHOT_URL: &str = "http://127.0.0.1:4317/api/snapshot";
const MAX_BYTES: usize = 2 * 1024 * 1024;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RawEnvelope {
    desktop: Option<serde_json::Value>,
    connection: String,
    stale: bool,
    last_success_at: Option<String>,
    snapshot: Option<RawSnapshot>,
    reporting: Option<serde_json::Value>,
}
#[derive(Deserialize)]
struct RawSnapshot {
    threads: Vec<RawThread>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RawThread {
    name_status: Option<String>,
    display_name: Option<serde_json::Value>,
    desktop_runtime: Option<serde_json::Value>,
    thread_id: String,
    title: String,
    title_source: Option<String>,
    runtime_state: String,
    updated_at: Option<serde_json::Value>,
    business: Option<serde_json::Value>,
    agent_report: Option<serde_json::Value>,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Snapshot {
    #[serde(skip_serializing_if = "Option::is_none")]
    desktop: Option<serde_json::Value>,
    connection: String,
    stale: bool,
    last_success_at: Option<String>,
    threads: Option<Vec<Thread>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    reporting: Option<serde_json::Value>,
}
impl Snapshot {
    pub(crate) fn contains_thread(&self, id: &str) -> bool {
        self.threads.as_ref().is_some_and(|threads| threads.iter().any(|thread| thread.thread_id == id))
    }
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct Thread {
    #[serde(skip_serializing_if = "Option::is_none")]
    name_status: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    display_name: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    desktop_runtime: Option<serde_json::Value>,
    thread_id: String,
    title: String,
    title_source: String,
    runtime_state: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    updated_at: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    business: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    agent_report: Option<serde_json::Value>,
}

fn display_name_view(raw: Option<serde_json::Value>, id: &str, runtime: Option<&serde_json::Value>) -> Option<serde_json::Value> {
 let d=raw?;let turn=runtime?["turnId"].as_str()?;
 let retained=d["source"]=="model-user-content-retained";
 let automatic=d["source"]=="local-user-keywords"||d["source"]=="model-user-content"||retained;
 if turn.trim().is_empty()||(!automatic&&d["source"]!="reviewed-user-content")||d["threadId"]!=id||d["turnId"]!=turn{return None;}
 let source_turn=if retained {Some(d["sourceTurnId"].as_str().filter(|s|!s.trim().is_empty()&&s.len()<=100)?)} else {None};
 let parts=d["parts"].as_array()?;if parts.is_empty()||(!automatic&&parts.len()<2)||parts.len()>4{return None;}
 let mut safe=Vec::new();let mut count=0;let mut identity=false;let mut object=false;
 for p in parts{let kind=p["kind"].as_str()?;let text=p["text"].as_str()?;let n=text.chars().count();if !["company","project","object","action"].contains(&kind)||text.trim().is_empty()||n>48{return None;}count+=n;identity|=["company","project"].contains(&kind);object|=kind=="object";safe.push(serde_json::json!({"kind":kind,"text":text}));}
 if count>80||(!automatic&&!identity)||!object{return None;}
 let mut result=serde_json::json!({"source":d["source"],"threadId":id,"turnId":turn,"parts":safe});
 if let Some(source_turn)=source_turn {result["sourceTurnId"]=source_turn.into();}
 Some(result)
}

fn agent_report_view(raw: Option<serde_json::Value>, id: &str) -> Option<serde_json::Value> {
 let r=raw?;
 if r["source"]!="agent-report"||r["threadId"]!=id {return None;}
 for key in ["threadId","turnId","runId"] {if !r[key].as_str().is_some_and(|s| !s.is_empty()&&s.len()<=100&&s.chars().all(|c|c.is_ascii_alphanumeric()||c=='-'||c=='_')) {return None;}}
 let state=r["state"].as_str()?;
 if !["active","blocked","ended"].contains(&state) {return None;}
 let seq=r["seq"].as_u64()?;if seq==0||seq>2147483647{return None;}
 let seen=r["seenAt"].as_u64()?;let progress=r["progressAt"].as_u64()?;
 if progress>seen||seen>8640000000000000{return None;}
 let fresh=r["fresh"].as_bool()?;
 let plan=r["plan"].as_array()?;if plan.len()>12{return None;}
 let mut safe_plan=Vec::new();let mut current=0;
 for item in plan {
  let step=item["step"].as_str()?;let status=item["status"].as_str()?;
  if step.trim().is_empty()||step.chars().count()>160||!["pending","in_progress","completed"].contains(&status){return None;}
  if status=="in_progress"{current+=1;}safe_plan.push(serde_json::json!({"step":step,"status":status}));
 }
 if current>1{return None;}
 let mut safe=serde_json::json!({"source":"agent-report","threadId":id,"turnId":r["turnId"],"runId":r["runId"],"seq":seq,"state":state,"seenAt":seen,"progressAt":progress,"fresh":fresh,"plan":safe_plan});
 if state=="ended" {let reason=r["reason"].as_str()?;if !["completed","interrupted","cancelled","failed"].contains(&reason){return None;}safe["reason"]=reason.into();}
 Some(safe)
}

fn desktop_view(raw: Option<serde_json::Value>, id: &str) -> Option<serde_json::Value> {
 let r=raw?;
 if r["source"]!="desktop-ipc"||r["threadId"]!=id {return None;}
 let state=r["state"].as_str()?;if !["running","stopped","unknown"].contains(&state){return None;}
 let seen=r["seenAt"].as_u64()?;if seen==0||seen>8640000000000000{return None;}
 let plan=r["plan"].as_array()?;if plan.len()>12{return None;}
 let mut safe_plan=Vec::new();let mut current=0;
 for p in plan {let step=p["step"].as_str()?;let status=p["status"].as_str()?;
  if step.trim().is_empty()||step.chars().count()>160||!["completed","pending","in_progress"].contains(&status){return None;}
  if status=="in_progress"{current+=1;}safe_plan.push(serde_json::json!({"step":step,"status":status}));
 }if current>1{return None;}
 let mut result=serde_json::json!({"source":"desktop-ipc","threadId":id,"state":state,"seenAt":seen,"plan":safe_plan});
 if let Some(turn)=r["turnId"].as_str().filter(|s|!s.is_empty()&&s.len()<=100) {result["turnId"]=turn.into();}
 if state=="stopped"&&r["stopSource"]=="codex-terminal-event" {if let Some(at)=r["stoppedAt"].as_u64().filter(|at|*at>0&&*at<=seen){result["stoppedAt"]=at.into();result["stopSource"]="codex-terminal-event".into();}}
 Some(result)
}

fn valid_explicit_deadline(value: &str) -> bool {
    if value.len()!=25 || !value.is_ascii() || !value.ends_with("+08:00") { return false; }
    let bytes=value.as_bytes();
    if bytes[4]!=b'-'||bytes[7]!=b'-'||bytes[10]!=b'T'||bytes[13]!=b':'||bytes[16]!=b':' {return false;}
    let number=|a,b|value[a..b].parse::<u32>().ok();
    let (Some(y),Some(m),Some(d),Some(h),Some(min),Some(sec))=
        (number(0,4),number(5,7),number(8,10),number(11,13),number(14,16),number(17,19)) else {return false;};
    let days=match m {1|3|5|7|8|10|12=>31,4|6|9|11=>30,2=>if y%4==0&&(y%100!=0||y%400==0){29}else{28},_=>0};
    y>=100&&d>=1&&d<=days&&h<24&&min<60&&sec<60
}
fn business_view(raw: Option<serde_json::Value>, thread_id: &str) -> Option<serde_json::Value> {
    let raw = raw?.as_object()?.clone();
    let mut view = serde_json::Map::new();
    for key in ["company", "project", "workContent", "subject", "partition", "deadline"] {
        let Some(field) = raw.get(key) else { continue; };
        let Some(value) = field["value"].as_str().filter(|v| !v.trim().is_empty() && v.len() <= 4096) else { continue; };
        let source = &field["source"];
        if source["sourceThreadId"] != thread_id { continue; }
        if !["sourceThreadId", "sourceTurnId", "sourceMessageId"].iter().all(|key|
            source[*key].as_str().is_some_and(|s| !s.is_empty() && !s.chars().any(char::is_whitespace))) { continue; }
        let mut safe = serde_json::json!({"value":value,"source":{
            "sourceThreadId":source["sourceThreadId"],"sourceTurnId":source["sourceTurnId"],"sourceMessageId":source["sourceMessageId"]}});
        if key == "deadline" {
            if field["basis"]["type"] != "explicit" || field["basis"]["timeZone"] != "Asia/Shanghai" || !valid_explicit_deadline(value) { continue; }
            safe["basis"] = serde_json::json!({"type":"explicit","timeZone":"Asia/Shanghai"});
        }
        if key == "partition" && !["实习","工作","学习"].contains(&value) { continue; }
        view.insert(key.to_string(),safe);
    }
    if view.is_empty() { None } else { Some(serde_json::Value::Object(view)) }
}

fn parse_payload(bytes: &[u8]) -> Result<Snapshot, &'static str> {
    let raw: RawEnvelope = serde_json::from_slice(bytes).map_err(|_| "snapshot_invalid")?;
    if !["live", "connecting", "disconnected"].contains(&raw.connection.as_str()) {
        return Err("snapshot_invalid");
    }
    let threads = raw
        .snapshot
        .map(|snapshot| {
            snapshot
                .threads
                .into_iter()
                .map(|thread| {
                    if thread.thread_id.trim().is_empty() {
                        return Err("snapshot_invalid");
                    }
                    let source = match thread.title_source.as_deref() {
                        Some("name") => "name",
                        Some("missing") => "missing",
                        _ => "unknown",
                    };
                    let desktop_runtime=desktop_view(thread.desktop_runtime, &thread.thread_id);
                      Ok(Thread {
                          name_status: thread.name_status.filter(|s|["ready","pending","unavailable","unrecognized","limited"].contains(&s.as_str())),
                        display_name: display_name_view(thread.display_name, &thread.thread_id, desktop_runtime.as_ref()),
                        desktop_runtime,
                        agent_report: agent_report_view(thread.agent_report, &thread.thread_id),
                        business: business_view(thread.business, &thread.thread_id),
                        thread_id: thread.thread_id,
                        title: thread.title,
                        title_source: source.into(),
                        runtime_state: thread.runtime_state,
                        updated_at: thread
                            .updated_at
                            .and_then(|value| value.as_f64())
                            .filter(|value| value.is_finite() && *value > 0.0),
                    })
                })
                .collect::<Result<Vec<_>, _>>()
        })
        .transpose()?;
    Ok(Snapshot {
        desktop: raw.desktop.map(|r|serde_json::json!({"status":if r["status"]=="available" {"available"} else {"unavailable"},"partial":r["partial"]==true})),
        connection: raw.connection,
        stale: raw.stale,
        last_success_at: raw.last_success_at,
        threads,
        reporting: raw.reporting.map(|r|serde_json::json!({"status":if r["status"]=="available" {"available"} else {"unavailable"}})),
    })
}

fn read_bounded(reader: &mut impl Read) -> Result<Vec<u8>, &'static str> {
    let mut bytes = Vec::new();
    reader
        .take((MAX_BYTES + 1) as u64)
        .read_to_end(&mut bytes)
        .map_err(|_| "snapshot_unavailable")?;
    if bytes.len() > MAX_BYTES {
        return Err("snapshot_too_large");
    }
    Ok(bytes)
}
fn fetch_from(url: &str, timeout: Duration) -> Result<Snapshot, &'static str> {
    fetch_with_token(url, timeout, None)
}
fn fetch_with_token(url: &str, timeout: Duration, token: Option<&str>) -> Result<Snapshot, &'static str> {
    let client = reqwest::blocking::Client::builder()
        .no_proxy()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(timeout)
        .build()
        .map_err(|_| "snapshot_unavailable")?;
    let request = client.get(url);
    let request = if let Some(token) = token { request.bearer_auth(token) } else { request };
    let mut response = request.send().map_err(|_| "snapshot_unavailable")?;
    if !response.status().is_success() {
        return Err("snapshot_http_status");
    }
    if response
        .content_length()
        .is_some_and(|length| length > MAX_BYTES as u64)
    {
        return Err("snapshot_too_large");
    }
    parse_payload(&read_bounded(&mut response)?)
}
pub(crate) fn fetch_snapshot() -> Result<Snapshot, &'static str> {
    fetch_from(SNAPSHOT_URL, Duration::from_secs(3))
}
pub(crate) fn fetch_authenticated(port: u16, token: &str) -> Result<Snapshot, &'static str> {
    fetch_with_token(&format!("http://127.0.0.1:{port}/api/snapshot"), Duration::from_secs(3), Some(token))
}
pub(crate) fn trusted_caller(label: &str, url: &tauri::Url) -> bool {
    label == "main"
        && url.username().is_empty()
        && url.password().is_none()
        && url.port().is_none()
        && matches!(
            (url.scheme(), url.host_str()),
            ("http" | "https", Some("tauri.localhost")) | ("tauri", Some("localhost"))
        )
}
#[cfg(test)]
#[path = "../../runtime/tests/transport.rs"]
mod transport_tests;
