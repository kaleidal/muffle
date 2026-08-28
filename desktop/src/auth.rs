use std::net::SocketAddr;
use std::path::Path;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use anyhow::{Context, Result, anyhow, bail};
use base64::Engine;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use rand::RngCore;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::net::TcpListener;

pub const PLAYBACK_CLIENT_ID: &str = "65b708073fc0480ea92a077233ca87bd";
pub const DEFAULT_WEB_CLIENT_ID: &str = "d420a117a32841c2b3474932e49fb54b";
const AUTHORIZE_URL: &str = "https://accounts.spotify.com/authorize";
const TOKEN_URL: &str = "https://accounts.spotify.com/api/token";
const REDIRECT_PATH: &str = "/login";

const WEB_SCOPES: &[&str] = &[
    "playlist-modify-private",
    "playlist-modify-public",
    "playlist-read-collaborative",
    "playlist-read-private",
    "user-follow-modify",
    "user-follow-read",
    "user-library-modify",
    "user-library-read",
    "user-modify-playback-state",
    "user-read-playback-position",
    "user-read-playback-state",
    "user-read-recently-played",
    "user-top-read",
];

const PLAYBACK_SCOPES: &[&str] = &[
    "app-remote-control",
    "streaming",
    "user-modify-playback-state",
    "user-read-currently-playing",
    "user-read-playback-state",
    "user-read-private",
];

#[derive(Clone)]
pub struct Grant {
    pub client_id: String,
    pub port: u16,
    pub scopes: &'static [&'static str],
}

impl Grant {
    pub fn web(client_id: Option<&str>) -> Self {
        Self {
            client_id: client_id
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .unwrap_or(DEFAULT_WEB_CLIENT_ID)
                .to_string(),
            port: 8989,
            scopes: WEB_SCOPES,
        }
    }

    pub fn playback() -> Self {
        Self {
            client_id: PLAYBACK_CLIENT_ID.to_string(),
            port: 8898,
            scopes: PLAYBACK_SCOPES,
        }
    }

    pub fn redirect_uri(&self) -> String {
        format!("http://127.0.0.1:{}{REDIRECT_PATH}", self.port)
    }
}

pub struct Flow {
    pub verifier: String,
    pub state: String,
    pub url: String,
}

pub fn begin(grant: &Grant) -> Flow {
    let verifier = random_token(48);
    let challenge = URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()));
    let state = random_token(18);
    let url = format!(
        "{AUTHORIZE_URL}?client_id={}&response_type=code&redirect_uri={}&code_challenge_method=S256&code_challenge={challenge}&state={state}&scope={}",
        grant.client_id,
        urlencoding::encode(&grant.redirect_uri()),
        urlencoding::encode(&grant.scopes.join(" "))
    );
    Flow {
        verifier,
        state,
        url,
    }
}

fn random_token(bytes: usize) -> String {
    let mut buffer = vec![0; bytes];
    rand::rng().fill_bytes(&mut buffer);
    URL_SAFE_NO_PAD.encode(buffer)
}

pub async fn callback_listener(port: u16) -> Result<TcpListener> {
    let address: SocketAddr = ([127, 0, 0, 1], port).into();
    TcpListener::bind(address)
        .await
        .with_context(|| format!("unable to listen on {address} for Spotify"))
}

pub async fn wait_for_code(listener: TcpListener, expected_state: &str) -> Result<String> {
    let deadline = tokio::time::sleep(Duration::from_secs(600));
    tokio::pin!(deadline);

    loop {
        let (mut stream, _) = tokio::select! {
            accepted = listener.accept() => accepted.context("Spotify callback listener failed")?,
            _ = &mut deadline => bail!("Spotify sign-in timed out"),
        };
        let mut reader = BufReader::new(&mut stream);
        let mut request_line = String::new();
        if reader.read_line(&mut request_line).await.is_err() {
            continue;
        }
        let result = parse_request_line(&request_line, expected_state);
        let (status, heading, message) = match &result {
            Ok(_) => (
                "200 OK",
                "You're connected",
                "Return to Muffle. This tab can close.".to_string(),
            ),
            Err(error) => (
                "400 Bad Request",
                "Spotify didn't connect",
                error.to_string(),
            ),
        };
        let body = callback_page(heading, &message);
        let response = format!(
            "HTTP/1.1 {status}\r\nContent-Type: text/html; charset=utf-8\r\nCache-Control: no-store\r\nConnection: close\r\nContent-Length: {}\r\n\r\n{body}",
            body.len()
        );
        let _ = stream.write_all(response.as_bytes()).await;
        let _ = stream.shutdown().await;
        if result.is_ok() {
            return result;
        }
    }
}

fn parse_request_line(line: &str, expected_state: &str) -> Result<String> {
    let target = line
        .split_whitespace()
        .nth(1)
        .ok_or_else(|| anyhow!("malformed callback"))?;
    let (path, query) = target.split_once('?').unwrap_or((target, ""));
    if path != REDIRECT_PATH {
        bail!("unexpected callback path");
    }
    let mut code = None;
    let mut state = None;
    let mut denied = None;
    for pair in query.split('&') {
        let (key, value) = pair.split_once('=').unwrap_or((pair, ""));
        let decoded = urlencoding::decode(value)
            .map(|value| value.into_owned())
            .unwrap_or_else(|_| value.to_string());
        match key {
            "code" => code = Some(decoded),
            "state" => state = Some(decoded),
            "error" => denied = Some(decoded),
            _ => {}
        }
    }
    if let Some(reason) = denied {
        bail!("Spotify refused sign-in: {reason}");
    }
    if state.as_deref() != Some(expected_state) {
        bail!("sign-in state mismatch");
    }
    code.ok_or_else(|| anyhow!("Spotify returned no authorization code"))
}

fn callback_page(heading: &str, message: &str) -> String {
    let message = message
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;");
    format!(
        "<!doctype html><html lang=\"en\"><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>{heading}</title><style>:root{{color-scheme:dark}}body{{margin:0;min-height:100vh;display:grid;place-items:center;background:#090909;color:#fff;font:16px system-ui}}main{{padding:40px 48px;border-radius:28px;background:#151515;max-width:360px}}h1{{margin:0 0 10px;font-size:28px}}p{{margin:0;color:#aaa;line-height:1.5}}</style><main><h1>{heading}</h1><p>{message}</p></main><script>setTimeout(()=>window.close(),1400)</script></html>"
    )
}

#[derive(Clone, Debug, Deserialize)]
pub struct TokenResponse {
    pub access_token: String,
    pub refresh_token: Option<String>,
    pub expires_in: Option<u64>,
    #[serde(default)]
    pub scope: String,
}

pub async fn exchange_code(
    http: &reqwest::Client,
    grant: &Grant,
    code: &str,
    verifier: &str,
) -> Result<TokenResponse> {
    token_request(
        http,
        &[
            ("client_id", grant.client_id.as_str()),
            ("grant_type", "authorization_code"),
            ("code", code),
            ("redirect_uri", grant.redirect_uri().as_str()),
            ("code_verifier", verifier),
        ],
    )
    .await
}

pub async fn refresh(
    http: &reqwest::Client,
    client_id: &str,
    refresh_token: &str,
) -> Result<TokenResponse> {
    token_request(
        http,
        &[
            ("client_id", client_id),
            ("grant_type", "refresh_token"),
            ("refresh_token", refresh_token),
        ],
    )
    .await
}

async fn token_request(http: &reqwest::Client, form: &[(&str, &str)]) -> Result<TokenResponse> {
    let response = http.post(TOKEN_URL).form(form).send().await?;
    let status = response.status();
    let text = response.text().await.unwrap_or_default();
    if !status.is_success() {
        let detail = serde_json::from_str::<serde_json::Value>(&text)
            .ok()
            .and_then(|value| {
                value["error_description"]
                    .as_str()
                    .or(value["error"].as_str())
                    .map(str::to_string)
            })
            .unwrap_or_else(|| status.to_string());
        bail!("Spotify rejected the token request: {detail}");
    }
    Ok(serde_json::from_str(&text)?)
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct StoredToken {
    pub client_id: String,
    pub access_token: String,
    pub refresh_token: String,
    pub expires_at: u64,
    pub scope: String,
}

impl StoredToken {
    pub fn from_response(
        client_id: &str,
        response: TokenResponse,
        previous_refresh: Option<&str>,
    ) -> Result<Self> {
        let refresh_token = response
            .refresh_token
            .or_else(|| previous_refresh.map(str::to_string))
            .ok_or_else(|| anyhow!("Spotify returned no refresh token"))?;
        Ok(Self {
            client_id: client_id.to_string(),
            access_token: response.access_token,
            refresh_token,
            expires_at: now() + response.expires_in.unwrap_or(3600),
            scope: response.scope,
        })
    }

    pub fn needs_refresh(&self) -> bool {
        now() + 90 >= self.expires_at
    }

    pub fn load(path: &Path) -> Option<Self> {
        std::fs::read_to_string(path)
            .ok()
            .and_then(|text| serde_json::from_str(&text).ok())
    }

    pub fn save(&self, path: &Path) -> Result<()> {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let temporary = path.with_extension("json.tmp");
        let mut options = std::fs::OpenOptions::new();
        options.write(true).create(true).truncate(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o600);
        }
        use std::io::Write;
        options
            .open(&temporary)?
            .write_all(&serde_json::to_vec(self)?)?;
        crate::paths::replace_file(&temporary, path)?;
        Ok(())
    }
}

fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or_default()
}
