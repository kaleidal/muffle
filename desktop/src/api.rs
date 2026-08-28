use std::sync::Arc;
use std::time::Duration;

use parking_lot::Mutex;
use reqwest::{Method, StatusCode};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tokio::sync::Semaphore;

use crate::auth::{self, StoredToken};

const API_BASE: &str = "https://api.spotify.com/v1";

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApiRequest {
    pub method: String,
    pub path: String,
    #[serde(default)]
    pub body: Option<Value>,
    #[serde(default)]
    pub text_body: Option<String>,
    #[serde(default)]
    pub content_type: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ApiResponse {
    pub status: u16,
    pub body: Option<Value>,
}

#[derive(Clone)]
pub struct SpotifyApi {
    http: reqwest::Client,
    token: Arc<tokio::sync::Mutex<Option<StoredToken>>>,
    token_path: std::path::PathBuf,
    limiter: Arc<Semaphore>,
    cooldown: Arc<Mutex<Option<std::time::Instant>>>,
}

impl SpotifyApi {
    pub fn new(http: reqwest::Client, token_path: std::path::PathBuf) -> Self {
        let token = StoredToken::load(&token_path);
        Self {
            http,
            token: Arc::new(tokio::sync::Mutex::new(token)),
            token_path,
            limiter: Arc::new(Semaphore::new(6)),
            cooldown: Arc::new(Mutex::new(None)),
        }
    }

    pub async fn signed_in(&self) -> bool {
        self.token.lock().await.is_some()
    }

    pub async fn set_token(&self, token: StoredToken) -> anyhow::Result<()> {
        token.save(&self.token_path)?;
        *self.token.lock().await = Some(token);
        Ok(())
    }

    pub async fn sign_out(&self) {
        *self.token.lock().await = None;
        let _ = std::fs::remove_file(&self.token_path);
    }

    async fn access_token(&self, force: bool) -> Result<String, String> {
        let mut token = self.token.lock().await;
        let Some(current) = token.as_mut() else {
            return Err("Not signed in to Spotify".into());
        };
        if force || current.needs_refresh() {
            let response = auth::refresh(&self.http, &current.client_id, &current.refresh_token)
                .await
                .map_err(|error| error.to_string())?;
            let updated = StoredToken::from_response(
                &current.client_id,
                response,
                Some(&current.refresh_token),
            )
            .map_err(|error| error.to_string())?;
            updated
                .save(&self.token_path)
                .map_err(|error| error.to_string())?;
            *current = updated;
        }
        Ok(current.access_token.clone())
    }

    pub async fn request(&self, request: ApiRequest) -> Result<ApiResponse, String> {
        validate_path(&request.path)?;
        let method = match request.method.as_str() {
            "GET" => Method::GET,
            "POST" => Method::POST,
            "PUT" => Method::PUT,
            "DELETE" => Method::DELETE,
            value => return Err(format!("Unsupported Spotify method: {value}")),
        };
        let _permit = self
            .limiter
            .acquire()
            .await
            .map_err(|_| "Spotify transport stopped".to_string())?;
        self.wait_for_cooldown().await;

        let url = if request.path.starts_with("https://api.spotify.com/v1/") {
            request.path.clone()
        } else {
            format!("{API_BASE}{}", request.path)
        };
        let mut attempt = 0;
        loop {
            let access_token = self.access_token(attempt > 0).await?;
            let mut builder = self
                .http
                .request(method.clone(), &url)
                .bearer_auth(access_token);
            if let Some(body) = &request.body {
                builder = builder.json(body);
            } else if let Some(body) = &request.text_body {
                builder = builder
                    .header(
                        reqwest::header::CONTENT_TYPE,
                        request.content_type.as_deref().unwrap_or("text/plain"),
                    )
                    .body(body.clone());
            } else if matches!(method, Method::POST | Method::PUT | Method::DELETE) {
                builder = builder.header(reqwest::header::CONTENT_LENGTH, 0);
            }

            let response = builder.send().await.map_err(|error| error.to_string())?;
            let status = response.status();
            if status == StatusCode::UNAUTHORIZED && attempt == 0 {
                attempt += 1;
                continue;
            }
            if status == StatusCode::TOO_MANY_REQUESTS && attempt < 3 {
                let seconds = response
                    .headers()
                    .get(reqwest::header::RETRY_AFTER)
                    .and_then(|value| value.to_str().ok())
                    .and_then(|value| value.parse::<u64>().ok())
                    .unwrap_or(1)
                    .min(30);
                *self.cooldown.lock() =
                    Some(std::time::Instant::now() + Duration::from_secs(seconds));
                attempt += 1;
                self.wait_for_cooldown().await;
                continue;
            }
            if status.is_server_error() && attempt == 0 {
                attempt += 1;
                tokio::time::sleep(Duration::from_millis(700)).await;
                continue;
            }

            let text = response.text().await.unwrap_or_default();
            if !status.is_success() {
                let message = serde_json::from_str::<Value>(&text)
                    .ok()
                    .and_then(|value| value["error"]["message"].as_str().map(str::to_string))
                    .filter(|message| !message.is_empty())
                    .unwrap_or_else(|| {
                        status.canonical_reason().unwrap_or("request failed").into()
                    });
                return Err(format!("Spotify API error {} {}", status.as_u16(), message));
            }
            let body =
                if text.trim().is_empty() {
                    None
                } else {
                    Some(serde_json::from_str(&text).map_err(|error| {
                        format!("Spotify returned an unexpected response: {error}")
                    })?)
                };
            return Ok(ApiResponse {
                status: status.as_u16(),
                body,
            });
        }
    }

    async fn wait_for_cooldown(&self) {
        let wait = self
            .cooldown
            .lock()
            .and_then(|until| until.checked_duration_since(std::time::Instant::now()));
        if let Some(wait) = wait {
            tokio::time::sleep(wait).await;
        }
    }
}

fn validate_path(path: &str) -> Result<(), String> {
    if path.starts_with('/') || path.starts_with("https://api.spotify.com/v1/") {
        Ok(())
    } else {
        Err("Spotify API paths must stay on api.spotify.com/v1".into())
    }
}
