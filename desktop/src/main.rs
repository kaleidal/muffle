#![cfg_attr(target_os = "windows", windows_subsystem = "windows")]

mod api;
mod app;
mod auth;
mod ipc;
#[cfg(target_os = "linux")]
mod mpris;
mod paths;
mod playback;
mod settings;
mod zeroconf;

use std::path::{Path, PathBuf};
use std::sync::{Arc, OnceLock};

use app::AppState;
use sabine::{
    SabineColor, SabineError, SabineLifecyclePolicy, SabineResult, SabineWindow,
    SingleInstancePolicy, TrayIcon, TrayMenuItem, WindowRegionRect,
};
use tracing_subscriber::EnvFilter;

const APP_ID: &str = "al.kaleid.muffle";
static RUNTIME: OnceLock<tokio::runtime::Runtime> = OnceLock::new();

fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::from_default_env().add_directive("muffle=info".parse().unwrap()),
        )
        .init();

    let launched = Arc::new(parking_lot::Mutex::new(None));
    let configured = Arc::clone(&launched);
    SabineWindow::main_with_process_mut(
        move |window| configure(window, &configured),
        move |process| {
            if let Some(app) = launched.lock().clone() {
                if let Some(emitter) = process.bridge_event_emitter() {
                    app.set_emitter(emitter);
                }
                app.start();
            }
        },
    );
}

fn configure(
    window: SabineWindow,
    launched: &parking_lot::Mutex<Option<Arc<AppState>>>,
) -> SabineResult<SabineWindow> {
    let runtime = RUNTIME.get_or_init(|| {
        tokio::runtime::Builder::new_multi_thread()
            .enable_all()
            .build()
            .expect("Muffle runtime")
    });
    let app = AppState::new(runtime.handle().clone()).map_err(startup_error)?;
    let hide_on_close = app.settings.read().keep_playing_in_background;
    *launched.lock() = Some(Arc::clone(&app));
    let window = window
        .background_color(SabineColor::rgb8(5, 5, 5))
        .size(1400, 900)
        .min_size(1000, 700)
        .title("Muffle")
        .single_instance_id(APP_ID)
        .single_instance(SingleInstancePolicy::ReuseExisting)
        .lifecycle_policy(SabineLifecyclePolicy::browser_tab().without_hibernation())
        .hide_on_close(hide_on_close)
        .tray_icon(tray());
    Ok(ipc::attach(platform_chrome(window), app))
}

#[cfg(target_os = "macos")]
fn platform_chrome(window: SabineWindow) -> SabineWindow {
    window.system_chrome()
}

#[cfg(not(target_os = "macos"))]
fn platform_chrome(window: SabineWindow) -> SabineWindow {
    window
        .frameless()
        .titlebar_drag_region(40)
        .drag_exclusion_region(WindowRegionRect::new(0, 0, 300, 40))
        .drag_exclusion_region(WindowRegionRect::new(-150, 0, 150, 40))
}

fn tray() -> TrayIcon {
    let mut tray = TrayIcon::new(APP_ID, "Muffle");
    tray.icon_path = resource_path("icon.png");
    tray.tooltip = Some("Muffle".into());
    tray.menu = vec![
        TrayMenuItem {
            id: "open".into(),
            label: "Open Muffle".into(),
            action: Some("open".into()),
            enabled: true,
            separator: false,
        },
        TrayMenuItem {
            id: "separator".into(),
            label: String::new(),
            action: None,
            enabled: false,
            separator: true,
        },
        TrayMenuItem {
            id: "quit".into(),
            label: "Quit".into(),
            action: Some("quit".into()),
            enabled: true,
            separator: false,
        },
    ];
    tray
}

fn resource_path(file_name: &str) -> Option<PathBuf> {
    let relative = Path::new(file_name);
    let packaged = std::env::current_exe()
        .ok()
        .and_then(|executable| executable.parent().map(Path::to_path_buf))
        .into_iter()
        .flat_map(|directory| {
            [
                directory.join("resources").join(relative),
                directory.join("..").join("Resources").join(relative),
                directory
                    .join("..")
                    .join("share")
                    .join("sabine")
                    .join(APP_ID)
                    .join(relative),
            ]
        })
        .find(|path| path.is_file());
    packaged.or_else(|| {
        std::env::current_dir()
            .ok()
            .map(|directory| directory.join("public").join(relative))
            .filter(|path| path.is_file())
    })
}

fn startup_error(error: impl std::fmt::Display) -> SabineError {
    SabineError::CreationFailed {
        message: error.to_string(),
    }
}
