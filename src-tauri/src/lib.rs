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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|_app| {
            #[cfg(windows)]
            {
                use tauri::Manager;
                for window in _app.webview_windows().values() {
                    taskbar_icon::apply(window);
                }
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
