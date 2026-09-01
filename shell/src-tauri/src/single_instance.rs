use std::{fs::{self, File, OpenOptions}, io, path::Path};
use std::io::Write;
#[cfg(windows)]
use std::os::windows::fs::OpenOptionsExt;

/// Shared production policy: duplicates are normal; protection failure is exit 2.
pub fn startup() -> Result<Option<File>, i32> {
    acquire().map_err(report_startup_error)
}

pub fn startup_at(path: &Path) -> Result<Option<File>, i32> {
    acquire_at(path).map_err(report_startup_error)
}

fn report_startup_error(error: io::Error) -> i32 {
    let message = format!("Codex Task Dock startup stopped; exit=2; kind={:?}; os={:?}. 检查LOCALAPPDATA环境变量及CodexTaskDock目录的读写权限，然后重新启动；不要删除锁文件，也不要关闭Codex任务。\n", error.kind(), error.raw_os_error());
    eprintln!("{}", message.trim());
    // Release has no console. Append a small non-sensitive recovery record as fallback.
    // Never log business data, authentication values or user directory paths.
    let directory = std::env::temp_dir().join("CodexTaskDock");
    if fs::create_dir_all(&directory).is_ok() {
        if let Ok(mut log) = OpenOptions::new().create(true).append(true).open(directory.join("startup-error.log")) {
            let _ = log.write_all(message.as_bytes());
        }
    }
    2
}

/// Hold this handle for the entire app lifetime. The file is deliberately not deleted:
/// a normal exit or crash releases Windows' exclusive open without a stale PID race.
pub fn acquire() -> io::Result<Option<File>> {
    let local = std::env::var_os("LOCALAPPDATA")
        .filter(|value| !value.is_empty())
        .ok_or_else(|| io::Error::new(io::ErrorKind::NotFound, "user data directory unavailable"))?;
    acquire_at(&Path::new(&local).join("CodexTaskDock").join("instance.lock"))
}

pub fn acquire_at(path: &Path) -> io::Result<Option<File>> {
    let parent = path.parent().ok_or_else(|| io::Error::new(io::ErrorKind::InvalidInput, "lock parent absent"))?;
    fs::create_dir_all(parent)?;
    #[cfg(windows)]
    {
        match OpenOptions::new().read(true).write(true).create(true).truncate(false).share_mode(0).open(path) {
            Ok(file) => Ok(Some(file)),
            // ERROR_SHARING_VIOLATION is the only expected existing-owner signal.
            Err(error) if error.raw_os_error() == Some(32) => Ok(None),
            Err(error) => Err(error),
        }
    }
    #[cfg(not(windows))]
    Err(io::Error::new(io::ErrorKind::Unsupported, "Windows singleton required"))
}
