use std::sync::Arc;
use std::time::Duration;

use sabine::{
    BridgeCommand, BridgeCommandDescriptor, BridgeError, BridgeResponse, BridgeResult, SabineWindow,
};
use serde::Deserialize;
use serde_json::{Value, json};

use crate::api::ApiRequest;
use crate::app::AppState;
use crate::settings::Settings;

fn respond(value: impl serde::Serialize) -> BridgeResult {
    serde_json::to_value(value)
        .map(BridgeResponse::json)
        .map_err(|error| BridgeError::new(error.to_string()))
}

fn register<F>(window: SabineWindow, name: &str, app: Arc<AppState>, handler: F) -> SabineWindow
where
    F: Fn(Arc<AppState>, BridgeCommand) -> BridgeResult + Send + Sync + 'static,
{
    window.bridge_descriptor_handler(
        BridgeCommandDescriptor::new(name).target("desktop"),
        move |command| handler(Arc::clone(&app), command),
    )
}

pub fn attach(mut window: SabineWindow, app: Arc<AppState>) -> SabineWindow {
    window = register(
        window,
        "muffle.openExternal",
        Arc::clone(&app),
        |_app, command| {
            let url = command
                .params
                .get("url")
                .and_then(Value::as_str)
                .ok_or_else(|| BridgeError::new("url is required"))?;
            if !(url.starts_with("https://") || url.starts_with("http://")) {
                return Err(BridgeError::new("only web links can be opened"));
            }
            open::that_detached(url).map_err(|error| BridgeError::new(error.to_string()))?;
            respond(())
        },
    );
    window = register(
        window,
        "muffle.pickPlaylistCover",
        Arc::clone(&app),
        |_app, _| {
            let Some(path) = rfd::FileDialog::new()
                .add_filter("JPEG image", &["jpg", "jpeg"])
                .pick_file()
            else {
                return respond(Value::Null);
            };
            let bytes = std::fs::read(path).map_err(|error| BridgeError::new(error.to_string()))?;
            if bytes.len() > 256 * 1024 {
                return Err(BridgeError::new(
                    "Playlist covers must be smaller than 256 KB",
                ));
            }
            if !bytes.starts_with(&[0xff, 0xd8, 0xff]) {
                return Err(BridgeError::new("Playlist covers must be JPEG images"));
            }
            use base64::Engine;
            respond(base64::engine::general_purpose::STANDARD.encode(bytes))
        },
    );
    window = register(window, "muffle.auth.status", Arc::clone(&app), |app, _| {
        respond(app.auth_state())
    });
    window = register(window, "muffle.auth.signIn", Arc::clone(&app), |app, _| {
        respond(json!({ "started": app.begin_web_sign_in() }))
    });
    window = register(window, "muffle.auth.signOut", Arc::clone(&app), |app, _| {
        app.sign_out();
        respond(())
    });
    window = register(
        window,
        "muffle.spotify.request",
        Arc::clone(&app),
        |app, command| {
            let request: ApiRequest = serde_json::from_value(command.params)
                .map_err(|error| BridgeError::new(format!("invalid Spotify request: {error}")))?;
            let result = app.runtime.block_on(app.api.request(request));
            if result
                .as_ref()
                .is_err_and(|error| error.contains("403") && error.to_lowercase().contains("scope"))
            {
                app.sign_out();
            }
            result.map_err(BridgeError::new).and_then(respond)
        },
    );
    window = register(
        window,
        "muffle.playback.status",
        Arc::clone(&app),
        |app, _| {
            respond(json!({
                "availability": app.playback_state(),
                "local": app.local_state(),
            }))
        },
    );
    window = register(
        window,
        "muffle.playback.authorize",
        Arc::clone(&app),
        |app, _| respond(json!({ "started": app.begin_playback_authorization() })),
    );
    window = register(
        window,
        "muffle.playback.command",
        Arc::clone(&app),
        |app, command| {
            let name = command
                .params
                .get("name")
                .and_then(Value::as_str)
                .ok_or_else(|| BridgeError::new("playback command name is required"))?;
            let params = command.params.get("params").unwrap_or(&Value::Null);
            app.player_command(name, params)
                .map_err(|error| BridgeError::new(error.to_string()))?;
            respond(())
        },
    );
    window = register(window, "muffle.settings.get", Arc::clone(&app), |app, _| {
        respond(app.settings.read().clone())
    });
    window = register(
        window,
        "muffle.settings.update",
        Arc::clone(&app),
        |app, command| {
            #[derive(Deserialize)]
            struct Request {
                settings: Settings,
            }
            let request: Request = serde_json::from_value(command.params)
                .map_err(|error| BridgeError::new(format!("invalid settings: {error}")))?;
            app.update_settings(request.settings)
                .map_err(|error| BridgeError::new(error.to_string()))?;
            respond(())
        },
    );
    window = register(
        window,
        "muffle.zeroconf.discover",
        Arc::clone(&app),
        |_app, command| {
            let timeout = command
                .params
                .get("timeoutMs")
                .and_then(Value::as_u64)
                .unwrap_or(1_800)
                .clamp(250, 5_000);
            crate::zeroconf::discover(Duration::from_millis(timeout))
                .map_err(|error| BridgeError::new(error.to_string()))
                .and_then(respond)
        },
    );
    window = register(
        window,
        "muffle.zeroconf.activate",
        Arc::clone(&app),
        |app, command| {
            #[derive(Deserialize)]
            struct Request {
                receiver: crate::zeroconf::Receiver,
            }
            let request: Request = serde_json::from_value(command.params)
                .map_err(|error| BridgeError::new(format!("invalid receiver: {error}")))?;
            let receiver = crate::zeroconf::discover(Duration::from_secs(2))
                .map_err(|error| BridgeError::new(error.to_string()))?
                .into_iter()
                .find(|receiver| receiver == &request.receiver)
                .ok_or_else(|| BridgeError::new("that receiver is no longer available"))?;
            let http = reqwest::blocking::Client::builder()
                .timeout(Duration::from_secs(6))
                .build()
                .map_err(|error| BridgeError::new(error.to_string()))?;
            let info = crate::zeroconf::get_info(&http, &receiver)
                .map_err(|error| BridgeError::new(error.to_string()))?;
            let credentials = crate::zeroconf::Credentials::load(&app.paths.credentials())
                .map_err(|error| BridgeError::new(error.to_string()))?;
            crate::zeroconf::add_user(
                &http,
                &receiver,
                &info,
                &credentials,
                &app.settings.read().device_name,
            )
            .map_err(|error| BridgeError::new(error.to_string()))?;
            respond(())
        },
    );
    window
}
