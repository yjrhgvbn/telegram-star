use tauri::{Emitter, Manager};

const EVENT_SWITCH_SERVER: &str = "telegram-star://switch-server";
const EVENT_CHECK_UPDATE: &str = "telegram-star://check-update";
const EVENT_RELOAD_REMOTE: &str = "telegram-star://reload-remote";
const EVENT_OPEN_REMOTE_BROWSER: &str = "telegram-star://open-remote-browser";
const EVENT_TEST_NOTIFICATION: &str = "telegram-star://test-notification";

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct UpdateCheckResult {
    channel: String,
    configured: bool,
    available: bool,
    current_version: Option<String>,
    version: Option<String>,
    body: Option<String>,
    date: Option<String>,
}

fn show_main_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

fn normalize_update_channel(channel: String) -> String {
    match channel.trim() {
        "beta" => "beta".to_string(),
        _ => "stable".to_string(),
    }
}

fn unconfigured_update_result(channel: String) -> UpdateCheckResult {
    UpdateCheckResult {
        channel,
        configured: false,
        available: false,
        current_version: None,
        version: None,
        body: None,
        date: None,
    }
}

#[tauri::command]
fn reveal_main_window(app: tauri::AppHandle) {
    show_main_window(&app);
}

#[cfg(desktop)]
#[tauri::command]
async fn check_update_channel(
    app: tauri::AppHandle,
    channel: String,
) -> Result<UpdateCheckResult, String> {
    use tauri_plugin_updater::UpdaterExt;

    let channel = normalize_update_channel(channel);
    let Some(pubkey) = option_env!("TAURI_UPDATER_PUBKEY")
        .map(str::trim)
        .filter(|value| !value.is_empty())
    else {
        return Ok(unconfigured_update_result(channel));
    };

    let endpoint_template = option_env!("TAURI_UPDATER_ENDPOINT_TEMPLATE")
        .unwrap_or("https://updates.telegram-star.example/{{channel}}/{{target}}/{{arch}}/{{current_version}}")
        .trim();

    if endpoint_template.is_empty() {
        return Ok(unconfigured_update_result(channel));
    }

    // Tauri updater 本身只认识 target/arch/current_version；channel 由我们在模板中先替换。
    let endpoint = endpoint_template.replace("{{channel}}", &channel);
    let endpoint_url =
        url::Url::parse(&endpoint).map_err(|error| format!("更新地址配置无效：{error}"))?;

    let update = app
        .updater_builder()
        .pubkey(pubkey)
        .endpoints(vec![endpoint_url])
        .map_err(|error| format!("更新通道配置失败：{error}"))?
        .build()
        .map_err(|error| format!("更新检查初始化失败：{error}"))?
        .check()
        .await
        .map_err(|error| format!("更新检查失败：{error}"))?;

    Ok(match update {
        Some(update) => UpdateCheckResult {
            channel,
            configured: true,
            available: true,
            current_version: Some(update.current_version),
            version: Some(update.version),
            body: update.body,
            date: update.date.map(|date| date.to_string()),
        },
        None => UpdateCheckResult {
            channel,
            configured: true,
            available: false,
            current_version: None,
            version: None,
            body: None,
            date: None,
        },
    })
}

#[cfg(not(desktop))]
#[tauri::command]
async fn check_update_channel(channel: String) -> Result<UpdateCheckResult, String> {
    Ok(unconfigured_update_result(normalize_update_channel(channel)))
}

#[cfg(desktop)]
fn build_tray(app: &tauri::App) -> tauri::Result<()> {
    use tauri::{
        menu::{Menu, MenuItem},
        tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    };

    let open_item = MenuItem::with_id(app, "open", "打开 Telegram Star", true, None::<&str>)?;
    let status_item =
        MenuItem::with_id(app, "connection-status", "连接状态：查看主窗口", false, None::<&str>)?;
    let reload_item = MenuItem::with_id(app, "reload-remote", "刷新页面", true, None::<&str>)?;
    let open_browser_item =
        MenuItem::with_id(app, "open-browser", "在浏览器打开", true, None::<&str>)?;
    let test_notification_item =
        MenuItem::with_id(app, "test-notification", "发送测试通知", true, None::<&str>)?;
    let switch_item = MenuItem::with_id(app, "switch-server", "切换服务器", true, None::<&str>)?;
    let check_update_item =
        MenuItem::with_id(app, "check-update", "检查更新", true, None::<&str>)?;
    let quit_item = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
    let menu = Menu::with_items(
        app,
        &[
            &open_item,
            &status_item,
            &reload_item,
            &open_browser_item,
            &test_notification_item,
            &switch_item,
            &check_update_item,
            &quit_item,
        ],
    )?;

    TrayIconBuilder::new()
        .tooltip("Telegram Star")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "open" => show_main_window(app),
            "reload-remote" => {
                show_main_window(app);
                let _ = app.emit(EVENT_RELOAD_REMOTE, ());
            }
            "open-browser" => {
                show_main_window(app);
                let _ = app.emit(EVENT_OPEN_REMOTE_BROWSER, ());
            }
            "test-notification" => {
                show_main_window(app);
                let _ = app.emit(EVENT_TEST_NOTIFICATION, ());
            }
            "switch-server" => {
                show_main_window(app);
                let _ = app.emit(EVENT_SWITCH_SERVER, ());
            }
            "check-update" => {
                show_main_window(app);
                let _ = app.emit(EVENT_CHECK_UPDATE, ());
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_main_window(tray.app_handle());
            }
        })
        .build(app)?;

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            #[cfg(desktop)]
            {
                app.handle()
                    .plugin(tauri_plugin_window_state::Builder::default().build())?;
                app.handle()
                    .plugin(tauri_plugin_updater::Builder::new().build())?;
                build_tray(app)?;
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            reveal_main_window,
            check_update_channel
        ])
        .run(tauri::generate_context!())
        .expect("failed to run Telegram Star desktop shell");
}
