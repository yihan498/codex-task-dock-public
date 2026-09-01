use std::{path::{Path,PathBuf},process::{Child,Command,Stdio},io::{BufRead,BufReader,Read},
 sync::{Mutex,mpsc},time::{Duration,Instant}};
#[cfg(windows)]
use std::os::windows::process::CommandExt;

pub(crate) fn parse_ready(line: &str) -> Result<(u16,String), &'static str> {
 if line.len()>1024{return Err("collector_invalid_handshake");}
 let value:serde_json::Value=serde_json::from_str(line).map_err(|_|"collector_invalid_handshake")?;
 let port=value["port"].as_u64().filter(|p|*p>1023&&*p<=65535).ok_or("collector_invalid_port")?;
 let token=value["token"].as_str().filter(|t|t.len()==64&&t.bytes().all(|b|b.is_ascii_hexdigit())).ok_or("collector_invalid_token")?;
 if value["event"]!="ready"{return Err("collector_not_ready");}
 Ok((port as u16,token.to_string()))
}
pub(crate) fn runtime_paths(exe_dir: &Path) -> (PathBuf,PathBuf) {
 (exe_dir.join("runtime/node.exe"),exe_dir.join("runtime/src/reader/main.mjs"))
}
struct OwnedCollector { port:u16, token:String, child:Child }
impl OwnedCollector {
 fn stop(&mut self) {
  drop(self.child.stdin.take());
  let until=Instant::now()+Duration::from_secs(2);
  while Instant::now()<until {
   if self.child.try_wait().ok().flatten().is_some(){return;}
   std::thread::sleep(Duration::from_millis(20));
  }
  let _=self.child.kill();let _=self.child.wait();
 }
}
impl Drop for OwnedCollector {fn drop(&mut self){self.stop();}}
fn start_runtime(node:&Path,main:&Path)->Result<OwnedCollector,&'static str>{
 let mut command=Command::new(node);
 command.arg(main).stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::null());
 #[cfg(windows)] command.creation_flags(0x08000000);
 let child=command.spawn().map_err(|_|"collector_runtime_missing")?;
 let mut owned=OwnedCollector{port:0,token:String::new(),child};
 let stdout=owned.child.stdout.take().ok_or("collector_pipe_failed")?;
 let (send,receive)=mpsc::channel();
 std::thread::spawn(move||{
  let mut line=String::new();
  let result=BufReader::new(stdout.take(1025)).read_line(&mut line)
    .map_err(|_|"collector_pipe_failed").and_then(|_|parse_ready(line.trim_end()));
  let _=send.send(result);
 });
 let (port,token)=receive.recv_timeout(Duration::from_secs(6)).map_err(|_|"collector_start_timeout")??;
 owned.port=port;owned.token=token;Ok(owned)
}
#[derive(Default)]
pub(crate) struct CollectorState(Mutex<Option<OwnedCollector>>);
impl CollectorState {
 pub(crate) fn shutdown(&self) {
  if let Ok(mut slot)=self.0.lock(){*slot=None;}
 }
 pub(crate) fn endpoint(&self)->Result<(u16,String),&'static str>{
  let mut slot=self.0.lock().map_err(|_|"collector_locked")?;
  if slot.as_mut().is_some_and(|p|p.child.try_wait().ok().flatten().is_some()){*slot=None;}
  if slot.is_none(){
   let exe=std::env::current_exe().map_err(|_|"collector_runtime_missing")?;
   let (node,main)=runtime_paths(exe.parent().ok_or("collector_runtime_missing")?);
   #[cfg(debug_assertions)]
   let (node,main)=if !main.is_file(){
    (PathBuf::from("C:/Program Files/nodejs/node.exe"),
     PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../src/reader/main.mjs"))
   }else{(node,main)};
   *slot=Some(start_runtime(&node,&main)?);
  }
  let current=slot.as_ref().ok_or("collector_not_ready")?;
  Ok((current.port,current.token.clone()))
 }
}
#[cfg(test)]
#[path = "../../delivery/tests/collector.rs"]
mod tests;
