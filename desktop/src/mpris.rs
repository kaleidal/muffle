use std::sync::{Arc, Weak};

use mpris_server::{LoopStatus, Metadata, PlaybackStatus, Player, Time, TrackId};
use tokio::sync::mpsc;

use crate::app::AppState;
use crate::playback::{LoadSpec, LocalState, Playback, PlayerCommand, RepeatMode};

const TRACK_PATH: &str = "/al/kaleid/Muffle/Track/";

pub struct MprisService {
    updates: mpsc::UnboundedSender<LocalState>,
}

impl MprisService {
    pub fn spawn(app: Weak<AppState>) -> Self {
        let (updates, receiver) = mpsc::unbounded_channel();
        let _ = std::thread::Builder::new()
            .name("muffle-mpris".into())
            .spawn(move || {
                let Ok(runtime) = tokio::runtime::Builder::new_current_thread()
                    .enable_all()
                    .build()
                else {
                    return;
                };
                let local = tokio::task::LocalSet::new();
                let _ = local.block_on(&runtime, run(receiver, app));
            });
        Self { updates }
    }

    pub fn update(&self, state: LocalState) {
        let _ = self.updates.send(state.snapshot());
    }
}

async fn run(
    mut updates: mpsc::UnboundedReceiver<LocalState>,
    app: Weak<AppState>,
) -> mpris_server::zbus::Result<()> {
    let player = Player::builder("al_kaleid_muffle")
        .identity("Muffle")
        .desktop_entry("al.kaleid.muffle")
        .can_control(true)
        .can_play(true)
        .can_pause(true)
        .can_go_next(true)
        .can_go_previous(true)
        .can_seek(true)
        .supported_uri_schemes(vec!["spotify".to_string()])
        .build()
        .await?;

    connect_commands(&player, app);
    let server = player.run();
    let publish = async {
        let mut previous: Option<LocalState> = None;
        while let Some(state) = updates.recv().await {
            if previous
                .as_ref()
                .is_none_or(|old| old.playback != state.playback)
            {
                let _ = player
                    .set_playback_status(playback_status(state.playback))
                    .await;
            }
            if previous.as_ref().is_none_or(|old| old.track != state.track) {
                let _ = player.set_metadata(metadata(&state)).await;
                let _ = player.set_can_seek(state.track.is_some()).await;
            }
            if previous
                .as_ref()
                .is_none_or(|old| old.volume != state.volume)
            {
                let _ = player
                    .set_volume(state.volume as f64 / u16::MAX as f64)
                    .await;
            }
            if previous
                .as_ref()
                .is_none_or(|old| old.shuffle != state.shuffle)
            {
                let _ = player.set_shuffle(state.shuffle).await;
            }
            if previous
                .as_ref()
                .is_none_or(|old| old.repeat != state.repeat)
            {
                let _ = player.set_loop_status(loop_status(state.repeat)).await;
            }
            player.set_position(Time::from_millis(state.position_ms as i64));
            if previous
                .as_ref()
                .is_some_and(|old| old.seek_sequence != state.seek_sequence)
            {
                let _ = player
                    .seeked(Time::from_millis(state.position_ms as i64))
                    .await;
            }
            previous = Some(state);
        }
    };
    tokio::select! {
        _ = server => {}
        _ = publish => {}
    }
    Ok(())
}

fn connect_commands(player: &Player, app: Weak<AppState>) {
    let command_app = app.clone();
    let command: Arc<dyn Fn(PlayerCommand) + Send + Sync> = Arc::new(move |command| {
        if let Some(app) = command_app.upgrade() {
            let _ = app.direct_player_command(command);
        }
    });
    {
        let command = command.clone();
        player.connect_play(move |_| command(PlayerCommand::Play));
    }
    {
        let command = command.clone();
        player.connect_pause(move |_| command(PlayerCommand::Pause));
    }
    {
        let command = command.clone();
        player.connect_play_pause(move |_| command(PlayerCommand::Toggle));
    }
    {
        let command = command.clone();
        player.connect_stop(move |_| command(PlayerCommand::Pause));
    }
    {
        let command = command.clone();
        player.connect_next(move |_| command(PlayerCommand::Next));
    }
    {
        let command = command.clone();
        player.connect_previous(move |_| command(PlayerCommand::Previous));
    }
    {
        let app = app.clone();
        player.connect_seek(move |_, offset| {
            if let Some(app) = app.upgrade() {
                let current = app.local_state().position_ms as i64;
                let position = (current + offset.as_millis()).max(0).min(u32::MAX as i64) as u32;
                let _ = app.direct_player_command(PlayerCommand::Seek(position));
            }
        });
    }
    {
        let command = command.clone();
        player.connect_set_position(move |_, _, position| {
            command(PlayerCommand::Seek(
                position.as_millis().max(0).min(u32::MAX as i64) as u32,
            ))
        });
    }
    {
        let command = command.clone();
        player.connect_set_volume(move |_, volume| {
            command(PlayerCommand::Volume(
                (volume.clamp(0.0, 1.0) * u16::MAX as f64).round() as u16,
            ))
        });
    }
    {
        let command = command.clone();
        player.connect_set_shuffle(move |_, enabled| command(PlayerCommand::Shuffle(enabled)));
    }
    {
        let command = command.clone();
        player.connect_set_loop_status(move |_, status| {
            command(PlayerCommand::Repeat(match status {
                LoopStatus::None => RepeatMode::Off,
                LoopStatus::Playlist => RepeatMode::Context,
                LoopStatus::Track => RepeatMode::Track,
            }))
        });
    }
    player.connect_open_uri(move |_, uri| {
        let uri = uri.to_string();
        let is_item = uri.starts_with("spotify:track:") || uri.starts_with("spotify:episode:");
        command(PlayerCommand::Load(LoadSpec {
            context_uri: (!is_item).then(|| uri.clone()),
            uris: is_item.then_some(uri).into_iter().collect(),
            play: true,
            ..LoadSpec::default()
        }))
    });
}

fn playback_status(playback: Playback) -> PlaybackStatus {
    match playback {
        Playback::Playing => PlaybackStatus::Playing,
        Playback::Paused | Playback::Loading => PlaybackStatus::Paused,
        Playback::Stopped => PlaybackStatus::Stopped,
    }
}

fn loop_status(repeat: RepeatMode) -> LoopStatus {
    match repeat {
        RepeatMode::Off => LoopStatus::None,
        RepeatMode::Context => LoopStatus::Playlist,
        RepeatMode::Track => LoopStatus::Track,
    }
}

fn metadata(state: &LocalState) -> Metadata {
    let Some(track) = &state.track else {
        return Metadata::new();
    };
    let mut builder = Metadata::builder()
        .title(track.title.clone())
        .artist(track.artists.clone())
        .album(track.album.clone())
        .length(Time::from_millis(track.duration_ms as i64))
        .url(track.uri.clone());
    if let Some(id) = track_id(&track.uri) {
        builder = builder.trackid(id);
    }
    if let Some(art) = &track.art_url {
        builder = builder.art_url(art.clone());
    }
    builder.build()
}

fn track_id(uri: &str) -> Option<TrackId> {
    let value: String = uri
        .chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() {
                character
            } else {
                '_'
            }
        })
        .collect();
    TrackId::try_from(format!("{TRACK_PATH}{value}")).ok()
}
