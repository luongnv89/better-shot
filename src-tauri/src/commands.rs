//! Tauri commands module

use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager};

#[cfg(target_os = "macos")]
use objc2::msg_send;
use objc2_app_kit::NSWindow;

use crate::clipboard::copy_image_to_clipboard;
use crate::image::{copy_screenshot_to_dir, crop_image, save_base64_image, CropRegion};
use crate::screenshot::{
    capture_all_monitors as capture_monitors, capture_primary_monitor, MonitorShot,
};
use crate::utils::{ensure_dir, generate_filename, get_desktop_path};
use base64::engine::general_purpose::STANDARD as BASE64_STANDARD;
use base64::Engine as _;

static SCREENCAPTURE_LOCK: Mutex<()> = Mutex::new(());

/// Process-unique counter to disambiguate temp-workspace filenames copied within
/// the same millisecond (two picked files sharing a basename would otherwise
/// collide and overwrite each other).
static TEMP_WORKSPACE_COUNTER: AtomicU64 = AtomicU64::new(0);

#[tauri::command]
pub async fn move_window_to_active_space(app_handle: AppHandle) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let window = app_handle
            .get_webview_window("main")
            .ok_or("Main window not found")?;

        window
            .with_webview(|webview| {
                let ns_window = webview.ns_window();
                if ns_window.is_null() {
                    return;
                }
                let ns_window = unsafe { &*ns_window.cast::<NSWindow>() };
                let current: usize = unsafe { msg_send![ns_window, collectionBehavior] };
                let move_to_active_space: usize = 1 << 1;
                let new_behavior = current | move_to_active_space;
                let _: () = unsafe { msg_send![ns_window, setCollectionBehavior: new_behavior] };
                let _: () = unsafe { msg_send![ns_window, orderFrontRegardless] };
            })
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Quick capture of primary monitor
#[tauri::command]
pub async fn capture_once(
    app_handle: AppHandle,
    save_dir: String,
    copy_to_clip: bool,
) -> Result<String, String> {
    let screenshot_path = capture_primary_monitor(app_handle).await?;
    let screenshot_path_str = screenshot_path.to_string_lossy().to_string();

    let saved_path = copy_screenshot_to_dir(&screenshot_path_str, &save_dir)?;

    if copy_to_clip {
        copy_image_to_clipboard(&saved_path)?;
    }

    Ok(saved_path)
}

/// Capture all monitors with geometry info
#[tauri::command]
pub async fn capture_all_monitors(
    _app_handle: AppHandle,
    save_dir: String,
) -> Result<Vec<MonitorShot>, String> {
    capture_monitors(&save_dir)
}

/// Crop a region from a screenshot
#[tauri::command]
pub async fn capture_region(
    screenshot_path: String,
    x: u32,
    y: u32,
    width: u32,
    height: u32,
    save_dir: String,
) -> Result<String, String> {
    let region = CropRegion {
        x,
        y,
        width,
        height,
    };
    crop_image(&screenshot_path, region, &save_dir)
}

/// Given a desired destination path, return a path that does not yet exist on
/// disk by inserting a `-2`, `-3`, ... suffix before the extension. If the
/// original path is free, it is returned unchanged.
fn unique_destination(dest: PathBuf) -> PathBuf {
    if !dest.exists() {
        return dest;
    }
    let parent = dest.parent().map(PathBuf::from).unwrap_or_default();
    let stem = dest
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("image")
        .to_string();
    let ext = dest.extension().and_then(|s| s.to_str()).unwrap_or("png");
    let mut counter = 2u32;
    loop {
        let candidate = parent.join(format!("{}-{}.{}", stem, counter, ext));
        if !candidate.exists() {
            return candidate;
        }
        counter += 1;
    }
}

/// Save an edited image from base64 data
#[tauri::command]
pub async fn save_edited_image(
    image_data: String,
    save_dir: String,
    copy_to_clip: bool,
    prefix: Option<String>,
    filename: Option<String>,
    no_overwrite: Option<bool>,
) -> Result<String, String> {
    let chosen_prefix = prefix.unwrap_or_else(|| "bettershot".to_string());
    let no_overwrite = no_overwrite.unwrap_or(false);

    let saved_path = if let Some(name) = filename {
        // honor custom filename; append .png if needed
        let mut final_name = name.trim().to_string();
        if final_name.is_empty() {
            save_base64_image(&image_data, &save_dir, &chosen_prefix)?
        } else {
            if !final_name.to_lowercase().ends_with(".png") {
                final_name.push_str(".png");
            }
            let dest_path = PathBuf::from(&save_dir);
            ensure_dir(&dest_path).map_err(|e| e)?;
            let mut file_path = dest_path.join(final_name);
            // In no-overwrite mode (batch export), never clobber an existing
            // file on disk: pick a `-2`, `-3`, ... suffixed name instead.
            if no_overwrite {
                file_path = unique_destination(file_path);
            }
            let base64_data = image_data
                .strip_prefix("data:image/png;base64,")
                .ok_or("Invalid image data format: expected data:image/png;base64, prefix")?;
            let image_bytes = BASE64_STANDARD
                .decode(base64_data)
                .map_err(|e| format!("Failed to decode base64: {}", e))?;
            std::fs::write(&file_path, image_bytes)
                .map_err(|e| format!("Failed to save image: {}", e))?;
            file_path
                .to_str()
                .map(|s| s.to_string())
                .ok_or_else(|| "Failed to convert file path to string".to_string())?
        }
    } else {
        save_base64_image(&image_data, &save_dir, &chosen_prefix)?
    };

    if copy_to_clip {
        copy_image_to_clipboard(&saved_path)?;
    }

    Ok(saved_path)
}

/// Get the user's Desktop directory path (cross-platform)
#[tauri::command]
pub async fn get_desktop_directory() -> Result<String, String> {
    get_desktop_path()
}

/// Get the system temp directory path (cross-platform)
/// Returns the canonical/resolved path to avoid symlink issues
#[tauri::command]
pub async fn get_temp_directory() -> Result<String, String> {
    let temp_dir = std::env::temp_dir();
    // Canonicalize to resolve symlinks (e.g., /tmp -> /private/tmp on macOS)
    let canonical = temp_dir.canonicalize().unwrap_or(temp_dir);
    canonical
        .to_str()
        .map(|s| s.to_string())
        .ok_or_else(|| "Failed to convert temp directory path to string".to_string())
}

/// Check if screencapture is already running
fn is_screencapture_running() -> bool {
    let output = Command::new("pgrep")
        .arg("-x")
        .arg("screencapture")
        .output();

    match output {
        Ok(o) => o.status.success(),
        Err(_) => false,
    }
}

/// Check screen recording permission by attempting a minimal test
/// This helps macOS recognize the permission is already granted
fn check_and_activate_permission() -> Result<(), String> {
    let test_path = std::env::temp_dir().join(format!("bs_test_{}.png", std::process::id()));

    let output = Command::new("screencapture")
        .arg("-x")
        .arg("-T")
        .arg("0")
        .arg(&test_path)
        .stderr(Stdio::piped())
        .stdout(Stdio::piped())
        .output();

    match output {
        Ok(o) => {
            let stderr = String::from_utf8_lossy(&o.stderr);
            let _ = std::fs::remove_file(&test_path);

            if stderr.contains("permission")
                || stderr.contains("denied")
                || stderr.contains("not authorized")
            {
                return Err("Screen Recording permission not granted".to_string());
            }

            Ok(())
        }
        Err(e) => {
            let err_msg = e.to_string();
            if err_msg.contains("permission")
                || err_msg.contains("denied")
                || err_msg.contains("not authorized")
            {
                Err("Screen Recording permission not granted".to_string())
            } else {
                Ok(())
            }
        }
    }
}

/// Capture screenshot using macOS native screencapture with interactive selection
/// This properly handles Screen Recording permissions through the system
#[tauri::command]
pub async fn native_capture_interactive(save_dir: String) -> Result<String, String> {
    let _lock = SCREENCAPTURE_LOCK
        .lock()
        .map_err(|e| format!("Failed to acquire lock: {}", e))?;

    if is_screencapture_running() {
        return Err("Another screenshot capture is already in progress".to_string());
    }

    check_and_activate_permission().map_err(|e| {
        format!("Permission check failed: {}. Please ensure Screen Recording permission is granted in System Settings > Privacy & Security > Screen Recording.", e)
    })?;

    let filename = generate_filename("screenshot", "png")?;
    let save_path = PathBuf::from(&save_dir);
    let screenshot_path = save_path.join(&filename);
    let path_str = screenshot_path.to_string_lossy().to_string();

    let child = Command::new("screencapture")
        .arg("-i")
        .arg("-x")
        .arg(&path_str)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to run screencapture: {}", e))?;

    let output = child
        .wait_with_output()
        .map_err(|e| format!("Failed to wait for screencapture: {}", e))?;

    if !output.status.success() {
        if screenshot_path.exists() {
            let _ = std::fs::remove_file(&screenshot_path);
        }
        let stderr = String::from_utf8_lossy(&output.stderr);
        if stderr.contains("permission")
            || stderr.contains("denied")
            || stderr.contains("not authorized")
        {
            return Err("Screen Recording permission required. Please grant permission in System Settings > Privacy & Security > Screen Recording and restart the app.".to_string());
        }
        return Err("Screenshot was cancelled or failed".to_string());
    }

    if screenshot_path.exists() {
        Ok(path_str)
    } else {
        Err("Screenshot was cancelled or failed".to_string())
    }
}

/// Capture full screen using macOS native screencapture
#[tauri::command]
pub async fn native_capture_fullscreen(save_dir: String) -> Result<String, String> {
    let _lock = SCREENCAPTURE_LOCK
        .lock()
        .map_err(|e| format!("Failed to acquire lock: {}", e))?;

    if is_screencapture_running() {
        return Err("Another screenshot capture is already in progress".to_string());
    }

    check_and_activate_permission().map_err(|e| {
        format!("Permission check failed: {}. Please ensure Screen Recording permission is granted in System Settings > Privacy & Security > Screen Recording.", e)
    })?;

    let filename = generate_filename("screenshot", "png")?;
    let save_path = PathBuf::from(&save_dir);
    let screenshot_path = save_path.join(&filename);
    let path_str = screenshot_path.to_string_lossy().to_string();

    let status = Command::new("screencapture")
        .arg("-x")
        .arg(&path_str)
        .status()
        .map_err(|e| format!("Failed to run screencapture: {}", e))?;

    if !status.success() {
        return Err("Screenshot failed".to_string());
    }

    if screenshot_path.exists() {
        Ok(path_str)
    } else {
        Err("Screenshot failed".to_string())
    }
}

/// Play the macOS screenshot sound
#[tauri::command]
pub async fn play_screenshot_sound() -> Result<(), String> {
    // macOS system screenshot sound path
    let sound_path = "/System/Library/Components/CoreAudio.component/Contents/SharedSupport/SystemSounds/system/Screen Capture.aif";

    // Use afplay to play the sound asynchronously (non-blocking)
    std::thread::spawn(move || {
        let _ = Command::new("afplay")
            .arg(sound_path)
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn();
    });

    Ok(())
}

#[tauri::command]
pub fn select_directory_dialog(default_path: Option<String>) -> Result<Option<String>, String> {
    #[cfg(target_os = "macos")]
    {
        let mut script = String::from("try\n");
        script.push_str("  set chosen to choose folder with prompt \"Select save directory\"");
        if let Some(path) = default_path {
            let escaped = path.replace('"', "\\\"");
            script.push(' ');
            script.push_str(&format!("default location POSIX file \"{}\"", escaped));
        }
        script.push_str("\n  return POSIX path of chosen\n");
        script.push_str("on error\n  return \"\"\nend try");

        let output = Command::new("osascript")
            .arg("-e")
            .arg(script)
            .output()
            .map_err(|e| format!("Failed to launch directory picker: {}", e))?;

        if !output.status.success() {
            return Err("Directory picker was cancelled or failed".to_string());
        }

        let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if path.is_empty() {
            Ok(None)
        } else {
            Ok(Some(path))
        }
    }

    #[cfg(not(target_os = "macos"))]
    {
        Err("Directory picker is only supported on macOS".to_string())
    }
}

#[tauri::command]
pub fn open_image_file_dialog() -> Result<Option<String>, String> {
    #[cfg(target_os = "macos")]
    {
        let script = r#"try
  set chosen to choose file with prompt "Select a photo to edit" of type {"public.png", "public.jpeg", "public.heic", "public.webp"}
  POSIX path of chosen
on error
  ""
end try"#;

        let output = Command::new("osascript")
            .arg("-e")
            .arg(script)
            .output()
            .map_err(|e| format!("Failed to launch image picker: {}", e))?;

        if !output.status.success() {
            return Err("Image picker was cancelled or failed".to_string());
        }

        let selected = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if selected.is_empty() {
            Ok(None)
        } else {
            Ok(Some(selected))
        }
    }

    #[cfg(not(target_os = "macos"))]
    {
        Err("Image picker is only supported on macOS".to_string())
    }
}

#[tauri::command]
pub fn open_image_files_dialog() -> Result<Vec<String>, String> {
    #[cfg(target_os = "macos")]
    {
        let script = r#"try
  set chosenFiles to choose file with prompt "Select photos to resize" of type {"public.png", "public.jpeg", "public.heic", "public.webp"} with multiple selections allowed
  set out to ""
  repeat with f in chosenFiles
    set out to out & POSIX path of f & linefeed
  end repeat
  return out
on error
  return ""
end try"#;

        // The AppleScript swallows user-cancel (`on error -> return ""`) and exits
        // successfully, so a non-success status / spawn failure here is a genuine
        // picker failure worth surfacing distinctly to the caller.
        let output = Command::new("osascript")
            .arg("-e")
            .arg(script)
            .output()
            .map_err(|e| format!("Failed to launch image picker: {}", e))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(format!("Image picker failed to launch: {}", stderr.trim()));
        }

        let stdout = String::from_utf8_lossy(&output.stdout);
        let paths: Vec<String> = stdout
            .lines()
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .collect();
        Ok(paths)
    }

    #[cfg(not(target_os = "macos"))]
    {
        Err("Image picker is only supported on macOS".to_string())
    }
}

#[tauri::command]
pub fn delete_temp_workspace_file(file_path: String) -> Result<(), String> {
    let path = PathBuf::from(&file_path);
    // Only delete files that are inside the bettershot-uploads temp directory
    let mut expected_dir = std::env::temp_dir();
    expected_dir.push("bettershot-uploads");
    let canonical_path = path
        .canonicalize()
        .map_err(|_| "File not found or already deleted".to_string())?;
    let canonical_dir = expected_dir
        .canonicalize()
        .map_err(|_| "Temp workspace directory not found".to_string())?;
    if !canonical_path.starts_with(&canonical_dir) {
        return Err("Refusing to delete file outside the bettershot-uploads workspace".to_string());
    }
    fs::remove_file(&canonical_path)
        .map_err(|e| format!("Failed to delete temp file: {}", e))
}

#[tauri::command]
pub fn copy_file_to_temp_workspace(source_path: String) -> Result<String, String> {
    let source = PathBuf::from(&source_path);
    // Canonicalize to resolve symlinks and reject path traversal components
    let source = source
        .canonicalize()
        .map_err(|_| "Selected file not found or path is invalid".to_string())?;
    if !source.exists() {
        return Err("Selected file no longer exists".to_string());
    }

    let mut target_dir = std::env::temp_dir();
    target_dir.push("bettershot-uploads");
    fs::create_dir_all(&target_dir)
        .map_err(|e| format!("Failed to prepare temporary folder: {}", e))?;

    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|e| format!("Failed to read system time: {}", e))?;

    let file_name = source
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("photo.png");
    let sanitized = sanitize_filename(file_name);

    // Append a process-unique counter so two files with the same basename copied
    // within the same millisecond do not produce the same dest path.
    let unique = TEMP_WORKSPACE_COUNTER.fetch_add(1, Ordering::Relaxed);
    let dest_name = format!("{}-{}-{}", timestamp.as_millis(), unique, sanitized);
    let destination = target_dir.join(dest_name);

    fs::copy(&source, &destination)
        .map_err(|e| format!("Failed to copy file: {}", e))?;

    destination
        .to_str()
        .map(|s| s.to_string())
        .ok_or_else(|| "Failed to convert temp path to string".to_string())
}

/// Name of the persistent app-data subdirectory that holds raw captures.
/// Kept as a constant so the dir resolver and the delete command agree on it.
const APP_CAPTURES_SUBDIR: &str = "captures";

/// Resolve (and create) the persistent app-data captures directory.
///
/// Raw captures are written straight here by passing this path as `save_dir` to
/// the `native_capture_*` commands. The directory lives under `app_data_dir()`,
/// which is already covered by the `$APPDATA/**` asset-protocol scope, so the
/// saved PNGs load directly via `convertFileSrc` with no copy step.
///
/// `create_dir_all` is idempotent, so calling this immediately before every
/// capture is cheap and guarantees the dir exists (screencapture fails if its
/// `save_dir` is missing) even when a capture fires very early via a global
/// shortcut or the tray menu.
#[tauri::command]
pub fn get_app_captures_dir(app_handle: AppHandle) -> Result<String, String> {
    let mut dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to resolve app data directory: {}", e))?;
    dir.push(APP_CAPTURES_SUBDIR);
    fs::create_dir_all(&dir)
        .map_err(|e| format!("Failed to create captures directory: {}", e))?;
    dir.to_str()
        .map(|s| s.to_string())
        .ok_or_else(|| "Failed to convert captures path to string".to_string())
}

/// Validate that `file` resolves to a location inside `dir`, returning the
/// canonicalized file path on success.
///
/// Pure and AppHandle-free so it can be unit-tested directly: the capture-delete
/// command resolves the captures dir, then defers the path-scoping decision here.
/// Canonicalizing both sides defeats `..` traversal and symlink escapes.
fn validate_within(file: &Path, dir: &Path) -> Result<PathBuf, String> {
    let canonical_path = file
        .canonicalize()
        .map_err(|_| "File not found or already deleted".to_string())?;
    let canonical_dir = dir
        .canonicalize()
        .map_err(|_| "Captures directory not found".to_string())?;
    if !canonical_path.starts_with(&canonical_dir) {
        return Err("Refusing to delete file outside the captures directory".to_string());
    }
    Ok(canonical_path)
}

/// Delete a single raw-capture PNG that has been evicted from the rolling buffer.
///
/// Scoped to the app-data captures directory (`app_data_dir()/captures`) so it
/// can never be used to delete arbitrary files — the existing
/// `delete_temp_workspace_file` is hard-locked to `bettershot-uploads` and
/// cannot be reused here.
#[tauri::command]
pub fn delete_capture_file(app_handle: AppHandle, file_path: String) -> Result<(), String> {
    let mut captures_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to resolve app data directory: {}", e))?;
    captures_dir.push(APP_CAPTURES_SUBDIR);

    let path = PathBuf::from(&file_path);
    let canonical_path = validate_within(&path, &captures_dir)?;
    fs::remove_file(&canonical_path)
        .map_err(|e| format!("Failed to delete capture file: {}", e))
}

fn sanitize_filename(value: &str) -> String {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        "photo".to_string()
    } else {
        trimmed
            .chars()
            .map(|c| {
                if c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-') {
                    c
                } else {
                    '_'
                }
            })
            .collect()
    }
}

/// Get the current mouse cursor position (for determining which screen to open editor on)
#[tauri::command]
pub async fn get_mouse_position() -> Result<(f64, f64), String> {
    // Use AppleScript to get mouse position - it's the most reliable cross-version approach
    let output = Command::new("osascript")
        .arg("-e")
        .arg("tell application \"System Events\" to return (get position of mouse)")
        .output()
        .map_err(|e| format!("Failed to get mouse position: {}", e))?;

    if !output.status.success() {
        return Err("Failed to get mouse position".to_string());
    }

    let position_str = String::from_utf8_lossy(&output.stdout);
    let parts: Vec<&str> = position_str.trim().split(", ").collect();

    if parts.len() != 2 {
        return Err("Invalid mouse position format".to_string());
    }

    let x: f64 = parts[0]
        .parse()
        .map_err(|_| "Failed to parse X coordinate")?;
    let y: f64 = parts[1]
        .parse()
        .map_err(|_| "Failed to parse Y coordinate")?;

    Ok((x, y))
}

/// Capture specific window using macOS native screencapture
#[tauri::command]
pub async fn native_capture_window(save_dir: String) -> Result<String, String> {
    let _lock = SCREENCAPTURE_LOCK
        .lock()
        .map_err(|e| format!("Failed to acquire lock: {}", e))?;

    if is_screencapture_running() {
        return Err("Another screenshot capture is already in progress".to_string());
    }

    check_and_activate_permission().map_err(|e| {
        format!("Permission check failed: {}. Please ensure Screen Recording permission is granted in System Settings > Privacy & Security > Screen Recording.", e)
    })?;

    let filename = generate_filename("screenshot", "png")?;
    let save_path = PathBuf::from(&save_dir);
    let screenshot_path = save_path.join(&filename);
    let path_str = screenshot_path.to_string_lossy().to_string();

    let child = Command::new("screencapture")
        .arg("-w")
        .arg("-x")
        .arg(&path_str)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to run screencapture: {}", e))?;

    let output = child
        .wait_with_output()
        .map_err(|e| format!("Failed to wait for screencapture: {}", e))?;

    if !output.status.success() {
        if screenshot_path.exists() {
            let _ = std::fs::remove_file(&screenshot_path);
        }
        let stderr = String::from_utf8_lossy(&output.stderr);
        if stderr.contains("permission")
            || stderr.contains("denied")
            || stderr.contains("not authorized")
        {
            return Err("Screen Recording permission required. Please grant permission in System Settings > Privacy & Security > Screen Recording and restart the app.".to_string());
        }
        return Err("Screenshot was cancelled or failed".to_string());
    }

    if screenshot_path.exists() {
        Ok(path_str)
    } else {
        Err("Screenshot was cancelled or failed".to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::{sanitize_filename, unique_destination, validate_within};
    use std::fs;
    use std::path::PathBuf;
    use std::sync::atomic::{AtomicU64, Ordering};

    static TEST_DIR_COUNTER: AtomicU64 = AtomicU64::new(0);

    /// A throwaway temp directory that removes itself on drop.
    struct TempDir(PathBuf);

    impl TempDir {
        fn new() -> Self {
            let mut dir = std::env::temp_dir();
            let unique = TEST_DIR_COUNTER.fetch_add(1, Ordering::Relaxed);
            dir.push(format!("bs-unique-dest-test-{}-{}", std::process::id(), unique));
            fs::create_dir_all(&dir).unwrap();
            TempDir(dir)
        }
    }

    impl Drop for TempDir {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn returns_path_unchanged_when_free() {
        let tmp = TempDir::new();
        let dest = tmp.0.join("shot-1280x800.png");
        assert_eq!(unique_destination(dest.clone()), dest);
    }

    #[test]
    fn suffixes_when_target_exists() {
        let tmp = TempDir::new();
        let dest = tmp.0.join("shot-1280x800.png");
        fs::write(&dest, b"x").unwrap();
        assert_eq!(unique_destination(dest), tmp.0.join("shot-1280x800-2.png"));
    }

    #[test]
    fn increments_suffix_past_existing_suffixed_files() {
        let tmp = TempDir::new();
        let dest = tmp.0.join("shot-1280x800.png");
        fs::write(&dest, b"x").unwrap();
        fs::write(tmp.0.join("shot-1280x800-2.png"), b"x").unwrap();
        fs::write(tmp.0.join("shot-1280x800-3.png"), b"x").unwrap();
        assert_eq!(unique_destination(dest), tmp.0.join("shot-1280x800-4.png"));
    }

    // ---- validate_within (scoping for delete_capture_file) ----

    #[test]
    fn validate_within_accepts_a_file_inside_the_dir() {
        let tmp = TempDir::new();
        let file = tmp.0.join("capture-1.png");
        fs::write(&file, b"x").unwrap();
        let ok = validate_within(&file, &tmp.0).expect("file inside dir should validate");
        // Returns the canonicalized path, which must still live under the dir.
        assert!(ok.starts_with(tmp.0.canonicalize().unwrap()));
    }

    #[test]
    fn validate_within_rejects_a_file_outside_the_dir() {
        // The captures dir and a sibling dir holding the target file.
        let captures = TempDir::new();
        let other = TempDir::new();
        let outside = other.0.join("victim.png");
        fs::write(&outside, b"x").unwrap();

        let err = validate_within(&outside, &captures.0)
            .expect_err("a file outside the captures dir must be rejected");
        assert!(
            err.contains("outside the captures directory"),
            "unexpected error: {err}"
        );
        // The rejected file must NOT have been touched.
        assert!(outside.exists());
    }

    #[test]
    fn validate_within_rejects_path_traversal_escape() {
        let captures = TempDir::new();
        let other = TempDir::new();
        let outside = other.0.join("victim.png");
        fs::write(&outside, b"x").unwrap();

        // A traversal path that climbs out of the captures dir into the sibling.
        let traversal = captures
            .0
            .join("..")
            .join(other.0.file_name().unwrap())
            .join("victim.png");

        let err = validate_within(&traversal, &captures.0)
            .expect_err("a traversal path escaping the captures dir must be rejected");
        assert!(
            err.contains("outside the captures directory"),
            "unexpected error: {err}"
        );
        assert!(outside.exists());
    }

    #[test]
    fn validate_within_errors_when_file_is_missing() {
        let captures = TempDir::new();
        let missing = captures.0.join("never-existed.png");
        let err = validate_within(&missing, &captures.0)
            .expect_err("a missing file must error rather than validate");
        assert!(err.contains("already deleted") || err.contains("not found"));
    }

    // ---- sanitize_filename (used by copy_file_to_temp_workspace) ----

    #[test]
    fn sanitize_filename_keeps_alphanumeric() {
        assert_eq!(sanitize_filename("photo123.png"), "photo123.png");
        assert_eq!(sanitize_filename("my-file_1.jpg"), "my-file_1.jpg");
    }

    #[test]
    fn sanitize_filename_replaces_special_chars() {
        assert_eq!(sanitize_filename("my photo!.png"), "my_photo_.png");
        assert_eq!(sanitize_filename("a/b\\c.png"), "a_b_c.png");
    }

    #[test]
    fn sanitize_filename_handles_empty_and_whitespace() {
        assert_eq!(sanitize_filename(""), "photo");
        assert_eq!(sanitize_filename("   "), "photo");
        assert_eq!(sanitize_filename("  photo.png  "), "photo.png");
    }

    // ---- copy_file_to_temp_workspace + delete_temp_workspace_file (handler pair) ----

    #[test]
    fn copy_file_to_temp_workspace_success_and_delete() {
        // Create a source file
        let src_dir = TempDir::new();
        let src = src_dir.0.join("source image!.png");
        fs::write(&src, b"fake png").unwrap();

        // Copy to temp workspace
        let dest_str = super::copy_file_to_temp_workspace(src.to_string_lossy().to_string())
            .expect("copy to temp workspace should succeed");
        let dest = PathBuf::from(&dest_str);
        assert!(dest.exists(), "destination should exist after copy");
        assert_eq!(fs::read(&dest).unwrap(), b"fake png");

        // Success path: delete the temp file
        super::delete_temp_workspace_file(dest_str.clone()).expect("delete should succeed");
        assert!(!dest.exists(), "destination should be gone after delete");

        // Error path: delete again should fail (already deleted)
        let err = super::delete_temp_workspace_file(dest_str).expect_err("second delete must fail");
        assert!(err.contains("already deleted") || err.contains("not found"));
    }

    #[test]
    fn copy_file_to_temp_workspace_rejects_missing_file() {
        let missing = "/tmp/bettershot-test-missing-99999.png";
        // Ensure it does not exist
        let _ = fs::remove_file(missing);
        let err = super::copy_file_to_temp_workspace(missing.to_string())
            .expect_err("missing source must error");
        assert!(err.contains("not found") || err.contains("path is invalid"));
    }

    #[test]
    fn delete_temp_workspace_rejects_outside_workspace() {
        let src_dir = TempDir::new();
        let outside = src_dir.0.join("outside.png");
        fs::write(&outside, b"x").unwrap();
        let err = super::delete_temp_workspace_file(outside.to_string_lossy().to_string())
            .expect_err("file outside workspace must be rejected");
        assert!(err.contains("outside the bettershot-uploads workspace") || err.contains("not found"));
    }

}
