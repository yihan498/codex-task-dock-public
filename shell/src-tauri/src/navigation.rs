pub(crate) fn thread_uri(id:&str)->Result<String,&'static str>{
 if id.len()!=36||!id.is_ascii()||!id.bytes().enumerate().all(|(i,b)|
  if [8,13,18,23].contains(&i){b==b'-'}else{b.is_ascii_hexdigit()}){return Err("invalid_thread_id");}
 Ok(format!("codex://threads/{id}"))
}
#[cfg(windows)]
pub(crate) fn open_thread(id:&str)->Result<(),&'static str>{
 use std::{ffi::c_void,ptr};
 #[link(name="shell32")]
 extern "system" {fn ShellExecuteW(hwnd:*mut c_void,operation:*const u16,file:*const u16,parameters:*const u16,directory:*const u16,show:i32)->isize;}
 let uri:Vec<u16>=thread_uri(id)?.encode_utf16().chain(Some(0)).collect();
 let operation:Vec<u16>="open".encode_utf16().chain(Some(0)).collect();
 let result=unsafe{ShellExecuteW(ptr::null_mut(),operation.as_ptr(),uri.as_ptr(),ptr::null(),ptr::null(),1)};
 if result>32{Ok(())}else{Err("codex_open_failed")}
}
#[cfg(not(windows))]
pub(crate) fn open_thread(_id:&str)->Result<(),&'static str>{Err("windows_only")}
#[cfg(test)]
#[path="../../delivery/tests/navigation.rs"]
mod tests;
