use std::sync::{Arc, Mutex};
use std::time::Instant;

use librespot_metadata::audio::{AudioItem, UniqueFields};
use librespot_playback::player::PlayerEvent;

use super::{LocalState, LocalTrack, Notify, Playback, RepeatMode};

pub async fn run_events(
    mut events: tokio::sync::mpsc::UnboundedReceiver<PlayerEvent>,
    state: Arc<Mutex<LocalState>>,
    notify: Notify,
) {
    let mut request_id = None;
    while let Some(event) = events.recv().await {
        if let PlayerEvent::PlayRequestIdChanged {
            play_request_id: next,
        } = &event
        {
            request_id = Some(*next);
            continue;
        }
        if let (Some(current), Some(incoming)) = (request_id, event.get_play_request_id())
            && current != incoming
        {
            continue;
        }
        let snapshot = {
            let mut current = state.lock().unwrap_or_else(|poison| poison.into_inner());
            apply(&mut current, event).then(|| current.clone())
        };
        if let Some(snapshot) = snapshot {
            notify(snapshot);
        }
    }
}

fn set<T: PartialEq>(target: &mut T, value: T) -> bool {
    if *target == value {
        false
    } else {
        *target = value;
        true
    }
}

fn apply(state: &mut LocalState, event: PlayerEvent) -> bool {
    match event {
        PlayerEvent::Stopped { .. } => {
            let mut changed = set(&mut state.playback, Playback::Stopped);
            changed |= set(&mut state.position_ms, 0);
            changed |= set(&mut state.position_at, None);
            changed
        }
        PlayerEvent::Loading { position_ms, .. } => {
            let mut changed =
                state.playback != Playback::Playing && set(&mut state.playback, Playback::Loading);
            changed |= set(&mut state.position_ms, position_ms);
            changed |= set(&mut state.position_at, None);
            changed |= set(&mut state.error, None);
            changed
        }
        PlayerEvent::Playing { position_ms, .. } => {
            state.playback = Playback::Playing;
            state.position_ms = position_ms;
            state.position_at = Some(Instant::now());
            true
        }
        PlayerEvent::Paused { position_ms, .. } => {
            state.playback = Playback::Paused;
            state.position_ms = position_ms;
            state.position_at = None;
            true
        }
        PlayerEvent::PositionCorrection { position_ms, .. }
        | PlayerEvent::PositionChanged { position_ms, .. } => {
            state.position_ms = position_ms;
            if state.playback == Playback::Playing {
                state.position_at = Some(Instant::now());
            }
            true
        }
        PlayerEvent::Seeked { position_ms, .. } => {
            state.position_ms = position_ms;
            state.position_at = (state.playback == Playback::Playing).then(Instant::now);
            state.seek_sequence = state.seek_sequence.wrapping_add(1);
            true
        }
        PlayerEvent::TrackChanged { audio_item } => {
            state.track = Some(track(&audio_item));
            state.error = None;
            true
        }
        PlayerEvent::Unavailable { track_id, .. } => set(
            &mut state.error,
            Some(format!(
                "This item isn't available: {}",
                track_id.to_uri().unwrap_or_default()
            )),
        ),
        PlayerEvent::VolumeChanged { volume } => set(&mut state.volume, volume),
        PlayerEvent::SessionConnected { user_name, .. } => {
            state.connected = true;
            state.username = user_name;
            true
        }
        PlayerEvent::SessionDisconnected { .. } => {
            state.connected = false;
            state.active_client.clear();
            true
        }
        PlayerEvent::SessionClientChanged { client_name, .. } => {
            set(&mut state.active_client, client_name)
        }
        PlayerEvent::ShuffleChanged { shuffle } => set(&mut state.shuffle, shuffle),
        PlayerEvent::RepeatChanged { context, track } => set(
            &mut state.repeat,
            if track {
                RepeatMode::Track
            } else if context {
                RepeatMode::Context
            } else {
                RepeatMode::Off
            },
        ),
        PlayerEvent::Preloading { .. }
        | PlayerEvent::TimeToPreloadNextTrack { .. }
        | PlayerEvent::EndOfTrack { .. }
        | PlayerEvent::PlayRequestIdChanged { .. }
        | PlayerEvent::AutoPlayChanged { .. }
        | PlayerEvent::FilterExplicitContentChanged { .. } => false,
    }
}

fn track(item: &AudioItem) -> LocalTrack {
    let (artists, album, is_episode) = match &item.unique_fields {
        UniqueFields::Track { artists, album, .. } => (
            artists.iter().map(|artist| artist.name.clone()).collect(),
            album.clone(),
            false,
        ),
        UniqueFields::Episode { show_name, .. } => {
            (vec![show_name.clone()], show_name.clone(), true)
        }
        UniqueFields::Local { artists, album, .. } => (
            artists.iter().cloned().collect(),
            album.clone().unwrap_or_default(),
            false,
        ),
    };
    let mut covers: Vec<_> = item.covers.iter().collect();
    covers.sort_by_key(|cover| std::cmp::Reverse(cover.width));
    let art_url = covers.first().map(|cover| cover.url.clone());
    let art_small_url = covers
        .iter()
        .rev()
        .find(|cover| cover.width >= 64)
        .or(covers.last())
        .map(|cover| cover.url.clone());
    LocalTrack {
        uri: item.uri.clone(),
        title: item.name.clone(),
        artists,
        album,
        art_url,
        art_small_url,
        duration_ms: item.duration_ms,
        is_episode,
    }
}
