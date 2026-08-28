mod events;

use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use anyhow::{Context, Result, anyhow};
use librespot_connect::{
    ConnectConfig, LoadContextOptions, LoadRequest, LoadRequestOptions, Options, PlayingTrack,
    Spirc,
};
use librespot_core::{
    authentication::Credentials,
    cache::Cache,
    config::{DeviceType, SessionConfig},
    session::Session,
};
use librespot_playback::{
    audio_backend,
    config::{AudioFormat, Bitrate, NormalisationType, PlayerConfig},
    mixer::{self, MixerConfig},
    player::Player,
};
use serde::{Deserialize, Serialize};
use sha1::{Digest, Sha1};

pub use events::run_events;

#[derive(Clone, Debug)]
pub struct EngineConfig {
    pub device_name: String,
    pub bitrate_kbps: u16,
    pub normalisation: bool,
    pub autoplay: bool,
    pub gapless: bool,
    pub backend: Option<String>,
    pub audio_device: Option<String>,
    pub initial_volume: u16,
    pub credentials_dir: PathBuf,
    pub volume_dir: PathBuf,
    pub audio_cache_dir: Option<PathBuf>,
    pub audio_cache_limit: Option<u64>,
}

impl EngineConfig {
    pub fn device_id(&self) -> String {
        self::hex(&Sha1::digest(self.device_name.as_bytes()))
    }

    pub fn cache(&self) -> Result<Cache> {
        Cache::new(
            Some(&self.credentials_dir),
            Some(&self.volume_dir),
            self.audio_cache_dir.as_ref(),
            self.audio_cache_limit,
        )
        .context("unable to open the playback cache")
    }

    fn bitrate(&self) -> Bitrate {
        match self.bitrate_kbps {
            96 => Bitrate::Bitrate96,
            160 => Bitrate::Bitrate160,
            _ => Bitrate::Bitrate320,
        }
    }
}

fn hex(bytes: &[u8]) -> String {
    use std::fmt::Write;
    let mut output = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        let _ = write!(output, "{byte:02x}");
    }
    output
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Playback {
    #[default]
    Stopped,
    Loading,
    Playing,
    Paused,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum RepeatMode {
    #[default]
    Off,
    Context,
    Track,
}

#[derive(Clone, Debug, Default, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalTrack {
    pub uri: String,
    pub title: String,
    pub artists: Vec<String>,
    pub album: String,
    pub art_url: Option<String>,
    pub art_small_url: Option<String>,
    pub duration_ms: u32,
    pub is_episode: bool,
}

#[derive(Clone, Debug, Default, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalState {
    pub playback: Playback,
    pub track: Option<LocalTrack>,
    pub position_ms: u32,
    #[serde(skip)]
    pub position_at: Option<Instant>,
    pub volume: u16,
    pub shuffle: bool,
    pub repeat: RepeatMode,
    pub connected: bool,
    pub username: String,
    pub active_client: String,
    pub error: Option<String>,
    pub seek_sequence: u64,
}

impl LocalState {
    pub fn snapshot(&self) -> Self {
        let mut snapshot = self.clone();
        if self.playback == Playback::Playing
            && let Some(observed) = self.position_at
        {
            let elapsed = observed.elapsed().as_millis() as u32;
            let duration = self
                .track
                .as_ref()
                .map(|track| track.duration_ms)
                .unwrap_or(u32::MAX);
            snapshot.position_ms = snapshot.position_ms.saturating_add(elapsed).min(duration);
        }
        snapshot
    }
}

#[derive(Clone, Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LoadSpec {
    pub context_uri: Option<String>,
    #[serde(default)]
    pub uris: Vec<String>,
    pub offset_uri: Option<String>,
    pub offset_index: Option<u32>,
    #[serde(default)]
    pub position_ms: u32,
    #[serde(default = "default_true")]
    pub play: bool,
    pub shuffle: Option<bool>,
}

fn default_true() -> bool {
    true
}

#[derive(Clone, Debug)]
pub enum PlayerCommand {
    Play,
    Pause,
    Toggle,
    Next,
    Previous,
    Seek(u32),
    Volume(u16),
    Shuffle(bool),
    Repeat(RepeatMode),
    Load(LoadSpec),
    Activate,
}

pub type Notify = Arc<dyn Fn(LocalState) + Send + Sync>;

pub struct Engine {
    player: Arc<Player>,
    spirc: Arc<Spirc>,
    device_id: String,
}

impl Engine {
    pub async fn connect(
        config: &EngineConfig,
        credentials: Credentials,
        cache: Cache,
        notify: Notify,
    ) -> Result<Self> {
        let device_id = config.device_id();
        let session = Session::new(
            SessionConfig {
                device_id: device_id.clone(),
                ap_port: Some(443),
                autoplay: Some(config.autoplay),
                ..SessionConfig::default()
            },
            Some(cache),
        );
        let sink_builder = audio_backend::find(config.backend.clone())
            .or_else(|| audio_backend::find(None))
            .ok_or_else(|| anyhow!("no audio backend is available"))?;
        let mixer_builder = mixer::find(Some("softvol"))
            .ok_or_else(|| anyhow!("soft volume mixer is unavailable"))?;
        let mixer = mixer_builder(MixerConfig::default())?;
        let device = config.audio_device.clone();
        let player = Player::new(
            PlayerConfig {
                bitrate: config.bitrate(),
                gapless: config.gapless,
                normalisation: config.normalisation,
                normalisation_type: NormalisationType::Auto,
                position_update_interval: Some(Duration::from_secs(1)),
                ..PlayerConfig::default()
            },
            session.clone(),
            mixer.get_soft_volume(),
            move || sink_builder(device.clone(), AudioFormat::S16),
        );
        let state = Arc::new(Mutex::new(LocalState {
            volume: config.initial_volume,
            ..LocalState::default()
        }));
        tokio::spawn(run_events(
            player.get_player_event_channel(),
            Arc::clone(&state),
            Arc::clone(&notify),
        ));
        let (spirc, task) = Spirc::new(
            ConnectConfig {
                name: config.device_name.clone(),
                device_type: DeviceType::Computer,
                initial_volume: config.initial_volume,
                disable_volume: false,
                volume_steps: 64,
                ..ConnectConfig::default()
            },
            session.clone(),
            credentials,
            Arc::clone(&player),
            Arc::clone(&mixer),
        )
        .await?;
        {
            let mut current = state.lock().unwrap_or_else(|poison| poison.into_inner());
            current.connected = true;
            current.username = session.username();
            notify(current.clone());
        }
        tokio::spawn(task);
        Ok(Self {
            player,
            spirc: Arc::new(spirc),
            device_id,
        })
    }

    pub fn device_id(&self) -> &str {
        &self.device_id
    }

    pub fn shutdown(&self) {
        let _ = self.spirc.shutdown();
        self.player.stop();
    }

    pub fn command(&self, command: PlayerCommand) -> Result<()> {
        match command {
            PlayerCommand::Play => self.spirc.play()?,
            PlayerCommand::Pause => self.spirc.pause()?,
            PlayerCommand::Toggle => self.spirc.play_pause()?,
            PlayerCommand::Next => self.spirc.next()?,
            PlayerCommand::Previous => self.spirc.prev()?,
            PlayerCommand::Seek(position) => self.spirc.set_position_ms(position)?,
            PlayerCommand::Volume(volume) => self.spirc.set_volume(volume)?,
            PlayerCommand::Shuffle(enabled) => self.spirc.shuffle(enabled)?,
            PlayerCommand::Repeat(mode) => match mode {
                RepeatMode::Off => {
                    self.spirc.repeat_track(false)?;
                    self.spirc.repeat(false)?;
                }
                RepeatMode::Context => {
                    self.spirc.repeat_track(false)?;
                    self.spirc.repeat(true)?;
                }
                RepeatMode::Track => {
                    self.spirc.repeat(false)?;
                    self.spirc.repeat_track(true)?;
                }
            },
            PlayerCommand::Activate => self.spirc.activate()?,
            PlayerCommand::Load(spec) => self.load(spec)?,
        }
        Ok(())
    }

    fn load(&self, spec: LoadSpec) -> Result<()> {
        let playing_track = spec
            .offset_uri
            .map(PlayingTrack::Uri)
            .or_else(|| spec.offset_index.map(PlayingTrack::Index));
        let options = LoadRequestOptions {
            start_playing: spec.play,
            seek_to: spec.position_ms,
            playing_track,
            context_options: spec.shuffle.map(|shuffle| {
                LoadContextOptions::Options(Options {
                    shuffle,
                    ..Options::default()
                })
            }),
        };
        let request = if let Some(context) = spec.context_uri {
            LoadRequest::from_context_uri(context, options)
        } else if !spec.uris.is_empty() {
            LoadRequest::from_tracks(spec.uris, options)
        } else {
            anyhow::bail!("nothing to play");
        };
        self.spirc.activate()?;
        self.spirc.load(request)?;
        Ok(())
    }
}
