use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

use anyhow::{Context, Result};
use librespot_core::authentication::Credentials;
use parking_lot::{Mutex, RwLock};
use sabine::BridgeEventEmitter;
use serde::Serialize;
use serde_json::json;

use crate::api::SpotifyApi;
use crate::auth::{self, StoredToken};
use crate::paths::AppPaths;
use crate::playback::{Engine, EngineConfig, LocalState, PlayerCommand};
use crate::settings::Settings;

#[derive(Clone, Debug, Serialize)]
#[serde(tag = "state", rename_all = "camelCase")]
pub enum AuthState {
    SignedOut,
    SigningIn,
    SignedIn,
    Failed { message: String },
}

#[derive(Clone, Debug, Serialize)]
#[serde(tag = "state", rename_all = "camelCase")]
pub enum PlaybackState {
    Unavailable,
    Authorizing,
    Connecting,
    Ready { device_id: String },
    Failed { message: String },
}

pub struct AppState {
    pub runtime: tokio::runtime::Handle,
    pub api: SpotifyApi,
    pub paths: AppPaths,
    pub settings: RwLock<Settings>,
    auth_state: RwLock<AuthState>,
    playback_state: RwLock<PlaybackState>,
    local_state: RwLock<LocalState>,
    engine: Mutex<Option<Arc<Engine>>>,
    web_sign_in_busy: AtomicBool,
    playback_sign_in_busy: AtomicBool,
    emitter: RwLock<Option<BridgeEventEmitter>>,
    #[cfg(target_os = "linux")]
    mpris: Mutex<Option<crate::mpris::MprisService>>,
    http: reqwest::Client,
}

impl AppState {
    pub fn new(runtime: tokio::runtime::Handle) -> Result<Arc<Self>> {
        let paths = AppPaths::discover();
        paths.ensure()?;
        let settings = Settings::load(&paths.settings());
        let http = reqwest::Client::builder()
            .user_agent("Muffle/1.0")
            .connect_timeout(Duration::from_secs(12))
            .timeout(Duration::from_secs(30))
            .build()?;
        let api = SpotifyApi::new(http.clone(), paths.web_token());
        let signed_in = runtime.block_on(api.signed_in());
        Ok(Arc::new(Self {
            runtime,
            api,
            paths,
            settings: RwLock::new(settings),
            auth_state: RwLock::new(if signed_in {
                AuthState::SignedIn
            } else {
                AuthState::SignedOut
            }),
            playback_state: RwLock::new(PlaybackState::Unavailable),
            local_state: RwLock::new(LocalState::default()),
            engine: Mutex::new(None),
            web_sign_in_busy: AtomicBool::new(false),
            playback_sign_in_busy: AtomicBool::new(false),
            emitter: RwLock::new(None),
            #[cfg(target_os = "linux")]
            mpris: Mutex::new(None),
            http,
        }))
    }

    pub fn set_emitter(&self, emitter: BridgeEventEmitter) {
        *self.emitter.write() = Some(emitter);
    }

    pub fn auth_state(&self) -> AuthState {
        self.auth_state.read().clone()
    }

    pub fn playback_state(&self) -> PlaybackState {
        self.playback_state.read().clone()
    }

    pub fn local_state(&self) -> LocalState {
        self.local_state.read().snapshot()
    }

    pub fn start(self: &Arc<Self>) {
        #[cfg(target_os = "linux")]
        {
            *self.mpris.lock() = Some(crate::mpris::MprisService::spawn(Arc::downgrade(self)));
        }
        let app = Arc::clone(self);
        self.runtime.spawn(async move {
            app.resume_playback().await;
        });
    }

    pub fn begin_web_sign_in(self: &Arc<Self>) -> bool {
        if self.web_sign_in_busy.swap(true, Ordering::AcqRel) {
            return false;
        }
        self.set_auth_state(AuthState::SigningIn);
        let app = Arc::clone(self);
        self.runtime.spawn(async move {
            let result = app.finish_web_sign_in().await;
            app.web_sign_in_busy.store(false, Ordering::Release);
            match result {
                Ok(()) => app.set_auth_state(AuthState::SignedIn),
                Err(error) => app.set_auth_state(AuthState::Failed {
                    message: error.to_string(),
                }),
            }
        });
        true
    }

    async fn finish_web_sign_in(&self) -> Result<()> {
        let client_id = self.settings.read().web_client_id.clone();
        let grant = auth::Grant::web(client_id.as_deref());
        let flow = auth::begin(&grant);
        let listener = auth::callback_listener(grant.port).await?;
        open::that_detached(&flow.url).context("unable to open Spotify sign-in")?;
        let code = auth::wait_for_code(listener, &flow.state).await?;
        let response = auth::exchange_code(&self.http, &grant, &code, &flow.verifier).await?;
        let requested_scope = grant.scopes.join(" ");
        let token =
            StoredToken::from_response(&grant.client_id, response, None, Some(&requested_scope))?;
        if !token.grants(auth::WEB_SCOPES) {
            anyhow::bail!("Spotify did not grant all requested permissions");
        }
        self.api.set_token(token).await?;
        Ok(())
    }

    pub fn begin_playback_authorization(self: &Arc<Self>) -> bool {
        if self.playback_sign_in_busy.swap(true, Ordering::AcqRel) {
            return false;
        }
        self.set_playback_state(PlaybackState::Authorizing);
        let app = Arc::clone(self);
        self.runtime.spawn(async move {
            let result = app.finish_playback_authorization().await;
            app.playback_sign_in_busy.store(false, Ordering::Release);
            if let Err(error) = result {
                app.set_playback_state(PlaybackState::Failed {
                    message: error.to_string(),
                });
            }
        });
        true
    }

    async fn finish_playback_authorization(self: &Arc<Self>) -> Result<()> {
        let grant = auth::Grant::playback();
        let flow = auth::begin(&grant);
        let listener = auth::callback_listener(grant.port).await?;
        open::that_detached(&flow.url).context("unable to open playback authorization")?;
        let code = auth::wait_for_code(listener, &flow.state).await?;
        let response = auth::exchange_code(&self.http, &grant, &code, &flow.verifier).await?;
        self.connect_engine(Credentials::with_access_token(response.access_token))
            .await
    }

    async fn resume_playback(self: &Arc<Self>) {
        let config = self.engine_config();
        let credentials = config.cache().ok().and_then(|cache| cache.credentials());
        if let Some(credentials) = credentials
            && let Err(error) = self.connect_engine(credentials).await
        {
            self.set_playback_state(PlaybackState::Failed {
                message: error.to_string(),
            });
        }
    }

    async fn connect_engine(self: &Arc<Self>, credentials: Credentials) -> Result<()> {
        self.set_playback_state(PlaybackState::Connecting);
        if let Some(previous) = self.engine.lock().take() {
            previous.shutdown();
        }
        let config = self.engine_config();
        let cache = config.cache()?;
        let app = Arc::downgrade(self);
        let notify = Arc::new(move |state: LocalState| {
            if let Some(app) = app.upgrade() {
                *app.local_state.write() = state.clone();
                #[cfg(target_os = "linux")]
                if let Some(mpris) = app.mpris.lock().as_ref() {
                    mpris.update(state.clone());
                }
                app.emit("muffle.playbackState", json!(state.snapshot()));
            }
        });
        let engine = tokio::time::timeout(
            Duration::from_secs(45),
            Engine::connect(&config, credentials, cache, notify),
        )
        .await
        .context("connecting local playback timed out")??;
        let device_id = engine.device_id().to_string();
        *self.engine.lock() = Some(Arc::new(engine));
        self.set_playback_state(PlaybackState::Ready {
            device_id: device_id.clone(),
        });
        Ok(())
    }

    fn engine_config(&self) -> EngineConfig {
        let settings = self.settings.read().clone();
        EngineConfig {
            device_name: settings.device_name,
            bitrate_kbps: settings.bitrate,
            normalisation: settings.normalisation,
            autoplay: settings.autoplay,
            gapless: settings.gapless,
            backend: settings.audio_backend,
            audio_device: settings.audio_device,
            initial_volume: (u16::MAX as u32 * 70 / 100) as u16,
            credentials_dir: self.paths.credentials(),
            volume_dir: self.paths.volume(),
            audio_cache_dir: settings.audio_cache.then(|| self.paths.audio_cache()),
            audio_cache_limit: settings
                .audio_cache
                .then_some(settings.audio_cache_mb * 1024 * 1024),
        }
    }

    pub fn player_command(&self, name: &str, params: &serde_json::Value) -> Result<()> {
        let command = match name {
            "play" => PlayerCommand::Play,
            "pause" => PlayerCommand::Pause,
            "toggle" => PlayerCommand::Toggle,
            "next" => PlayerCommand::Next,
            "previous" => PlayerCommand::Previous,
            "activate" => PlayerCommand::Activate,
            "seek" => PlayerCommand::Seek(value_u32(params, "positionMs")?),
            "volume" => {
                PlayerCommand::Volume(value_u32(params, "volume")?.min(u16::MAX as u32) as u16)
            }
            "shuffle" => PlayerCommand::Shuffle(value_bool(params, "enabled")?),
            "repeat" => PlayerCommand::Repeat(serde_json::from_value(
                params.get("mode").cloned().unwrap_or_default(),
            )?),
            "load" => PlayerCommand::Load(serde_json::from_value(params.clone())?),
            value => anyhow::bail!("unknown player command: {value}"),
        };
        self.direct_player_command(command)
    }

    pub fn direct_player_command(&self, command: PlayerCommand) -> Result<()> {
        self.engine
            .lock()
            .as_ref()
            .context("local playback is not authorized")?
            .command(command)
    }

    pub fn sign_out(self: &Arc<Self>) {
        if let Some(engine) = self.engine.lock().take() {
            engine.shutdown();
        }
        let api = self.api.clone();
        self.runtime.spawn(async move {
            api.sign_out().await;
        });
        let _ = std::fs::remove_file(self.paths.credentials().join("credentials.json"));
        self.set_auth_state(AuthState::SignedOut);
        self.set_playback_state(PlaybackState::Unavailable);
    }

    pub fn update_settings(self: &Arc<Self>, next: Settings) -> Result<()> {
        next.save(&self.paths.settings())?;
        *self.settings.write() = next;
        let app = Arc::clone(self);
        self.runtime.spawn(async move {
            app.resume_playback().await;
        });
        Ok(())
    }

    fn set_auth_state(&self, state: AuthState) {
        *self.auth_state.write() = state.clone();
        self.emit("muffle.authState", json!(state));
    }

    fn set_playback_state(&self, state: PlaybackState) {
        *self.playback_state.write() = state.clone();
        self.emit("muffle.playbackStatus", json!(state));
    }

    fn emit(&self, name: &str, payload: serde_json::Value) {
        if let Some(emitter) = self.emitter.read().as_ref() {
            let _ = emitter.emit(name, payload);
        }
    }
}

fn value_u32(value: &serde_json::Value, key: &str) -> Result<u32> {
    value
        .get(key)
        .and_then(serde_json::Value::as_u64)
        .map(|value| value.min(u32::MAX as u64) as u32)
        .with_context(|| format!("{key} is required"))
}

fn value_bool(value: &serde_json::Value, key: &str) -> Result<bool> {
    value
        .get(key)
        .and_then(serde_json::Value::as_bool)
        .with_context(|| format!("{key} is required"))
}
