use std::path::PathBuf;

use directories::ProjectDirs;

pub fn replace_file(temporary: &std::path::Path, target: &std::path::Path) -> std::io::Result<()> {
    #[cfg(target_os = "windows")]
    if target.exists() {
        std::fs::remove_file(target)?;
    }
    std::fs::rename(temporary, target)
}

#[derive(Clone, Debug)]
pub struct AppPaths {
    pub config: PathBuf,
    pub state: PathBuf,
    pub cache: PathBuf,
}

impl AppPaths {
    pub fn discover() -> Self {
        let Some(project) = ProjectDirs::from("al", "kaleid", "Muffle") else {
            let root = std::env::current_dir()
                .unwrap_or_default()
                .join("muffle-data");
            return Self {
                config: root.join("config"),
                state: root.join("state"),
                cache: root.join("cache"),
            };
        };
        Self {
            config: project.config_dir().to_path_buf(),
            state: project
                .state_dir()
                .map(ToOwned::to_owned)
                .unwrap_or_else(|| project.data_local_dir().to_path_buf()),
            cache: project.cache_dir().to_path_buf(),
        }
    }

    pub fn ensure(&self) -> std::io::Result<()> {
        for path in [&self.config, &self.state, &self.cache] {
            std::fs::create_dir_all(path)?;
        }
        Ok(())
    }

    pub fn settings(&self) -> PathBuf {
        self.config.join("settings.json")
    }

    pub fn web_token(&self) -> PathBuf {
        self.state.join("web-api-token.json")
    }

    pub fn credentials(&self) -> PathBuf {
        self.state.join("credentials")
    }

    pub fn volume(&self) -> PathBuf {
        self.state.join("volume")
    }

    pub fn audio_cache(&self) -> PathBuf {
        self.cache.join("audio")
    }
}
