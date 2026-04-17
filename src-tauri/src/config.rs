use std::fs;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct Config {
    pub current_vault: Option<String>,
    pub recent_vaults: Vec<String>,
}

fn config_path() -> PathBuf {
    dirs::home_dir()
        .expect("no home dir")
        .join(".config")
        .join("lattice")
        .join("config.json")
}

pub fn load() -> Config {
    let data = match fs::read_to_string(config_path()) {
        Ok(d) => d,
        Err(_) => return Config::default(),
    };
    serde_json::from_str(&data).unwrap_or_default()
}

pub fn save(config: &Config) -> std::io::Result<()> {
    let path = config_path();
    fs::create_dir_all(path.parent().unwrap())?;
    fs::write(&path, serde_json::to_string_pretty(config).unwrap())
}

pub fn set_vault(vault_path: &str) -> std::io::Result<Config> {
    let mut config = load();
    let p = vault_path.to_string();
    config.current_vault = Some(p.clone());
    config.recent_vaults.retain(|v| v != &p);
    config.recent_vaults.insert(0, p);
    config.recent_vaults.truncate(10);
    save(&config)?;
    Ok(config)
}
