/// Points the taskbar button at the icon the exe already carries.
///
/// Windows draws that button from the *window's* icon, and Tauri builds the
/// window icon out of the first frame of `icons/icon.ico` — 16px, here — then
/// lets the shell stretch it up. That stretch is the blur.
///
/// The exe's resource holds every frame `scripts/extract-app-icon.py` rendered,
/// so this asks Windows for the one matching the size it is about to draw. An
/// exact frame is never rescaled, which is the whole reason for shipping ten.
///
/// Installed copies looked right because their taskbar button borrows the
/// shortcut's icon, which comes from that resource already. The portable exe has
/// no shortcut to borrow from, so it showed what the window itself carried.
#[cfg(windows)]
mod taskbar_icon {
    use tauri::WebviewWindow;
    use windows_sys::Win32::Foundation::{HWND, LPARAM, WPARAM};
    use windows_sys::Win32::System::LibraryLoader::GetModuleHandleW;
    use windows_sys::Win32::UI::HiDpi::{GetDpiForWindow, GetSystemMetricsForDpi};
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        LoadImageW, SendMessageW, ICON_BIG, ICON_SMALL, IDI_APPLICATION, IMAGE_ICON,
        LR_DEFAULTCOLOR, SM_CXICON, SM_CXSMICON, SM_CYICON, SM_CYSMICON, WM_SETICON,
    };

    pub fn apply(window: &WebviewWindow) {
        let Ok(handle) = window.hwnd() else { return };
        let hwnd = handle.0 as HWND;

        unsafe {
            // Null asks for the running exe, which is where the icon resource is.
            let exe = GetModuleHandleW(std::ptr::null());
            // The only documented failure is a window that no longer exists; 96
            // is the unscaled baseline either way.
            let dpi = match GetDpiForWindow(hwnd) {
                0 => 96,
                d => d,
            };

            // Two sizes: the big one is the taskbar and alt-tab, the small one
            // the title bar and the window list.
            for (slot, cx, cy) in [
                (ICON_BIG, SM_CXICON, SM_CYICON),
                (ICON_SMALL, SM_CXSMICON, SM_CYSMICON),
            ] {
                // Tauri's bundler files the app icon under IDI_APPLICATION.
                let icon = LoadImageW(
                    exe,
                    IDI_APPLICATION,
                    IMAGE_ICON,
                    GetSystemMetricsForDpi(cx, dpi),
                    GetSystemMetricsForDpi(cy, dpi),
                    LR_DEFAULTCOLOR,
                );
                // Nothing to do on failure: the window keeps Tauri's icon.
                if !icon.is_null() {
                    SendMessageW(hwnd, WM_SETICON, slot as WPARAM, icon as LPARAM);
                }
            }
        }
    }
}

/// Opens the window at its configured 1600x900, centred — or maximized, on a
/// screen with less room than that.
///
/// The window starts hidden (`visible: false` in tauri.conf.json) so that it
/// never shows at a size it is about to leave: a laptop panel shorter than 900
/// logical pixels would otherwise get a window hanging off its bottom edge for a
/// frame before being maximized. Measured against the work area, so a taskbar
/// or dock that eats the last few rows counts as not enough room.
fn open_main_window(window: &tauri::WebviewWindow) {
    const WIDTH: f64 = 1600.0;
    const HEIGHT: f64 = 900.0;

    // A hidden window may not be on any monitor yet (GTK only places it once it
    // is shown), so fall back to the primary — which is where it will appear.
    let monitor = window
        .current_monitor()
        .ok()
        .flatten()
        .or_else(|| window.primary_monitor().ok().flatten());
    if let Some(monitor) = monitor {
        let area = monitor
            .work_area()
            .size
            .to_logical::<f64>(monitor.scale_factor());
        if area.width < WIDTH || area.height < HEIGHT {
            let _ = window.maximize();
        }
    }

    // Whatever the measuring above managed, the window has to appear.
    let _ = window.show();
    let _ = window.set_focus();
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        // Picking a folder in the dialog is what grants the app access to it —
        // the static fs scope in capabilities/default.json only covers the
        // game's own save directory. That grant lives in memory, so without
        // this the backup folder the user chose once would be unreadable the
        // next time the app starts. This writes the grants beside the app's
        // config and puts them back at launch.
        .plugin(tauri_plugin_persisted_scope::init())
        .setup(|app| {
            use tauri::Manager;
            #[cfg(windows)]
            {
                for window in app.webview_windows().values() {
                    taskbar_icon::apply(window);
                }
            }
            if let Some(window) = app.get_webview_window("main") {
                open_main_window(&window);
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
