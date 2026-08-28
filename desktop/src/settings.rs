use std::path::Path;

use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct Settings {
    pub device_name: String,
    pub bitrate: u16,
    pub normalisation: bool,
    pub autoplay: bool,
    pub gapless: bool,
    pub audio_backend: Option<String>,
    pub audio_device: Option<String>,
    pub audio_cache: bool,
    pub audio_cache_mb: u64,
    pub accent_from_art: bool,
    pub keep_playing_in_background: bool,
    pub web_client_id: Option<String>,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            device_name: "Muffle".into(),
            bitrate: 320,
            normalisation: false,
            autoplay: true,
            gapless: true,
            audio_backend: if cfg!(target_os = "linux") {
                Some("pulseaudio".into())
            } else {
                None
            },
            audio_device: None,
            audio_cache: true,
            audio_cache_mb: 1024,
            accent_from_art: true,
            keep_playing_in_background: true,
            web_client_id: None,
        }
    }
}

impl Settings {
    pub fn load(path: &Path) -> Self {
        std::fs::read_to_string(path)
            .ok()
            .and_then(|text| serde_json::from_str(&text).ok())
            .unwrap_or_default()
    }

    pub fn save(&self, path: &Path) -> anyhow::Result<()> {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let temporary = path.with_extension("json.tmp");
        std::fs::write(&temporary, serde_json::to_vec_pretty(self)?)?;
        crate::paths::replace_file(&temporary, path)?;
        Ok(())
    }
}
