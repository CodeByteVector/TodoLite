mod crypto;
mod database;
mod reminders;

use std::sync::Mutex;
use std::time::{Duration, Instant};

use tauri::{AppHandle, Manager, State};
use tauri_plugin_autostart::ManagerExt;

use database::AppDb;

// ------------------------------------------------------------------ state

pub struct DirtyState(pub Mutex<Option<Instant>>);

impl DirtyState {
    pub fn mark(&self) {
        *self.0.lock().unwrap() = Some(Instant::now());
    }
}

fn notify_dirty(app: &AppHandle) {
    let s = app.state::<DirtyState>();
    s.mark();
}

fn err_string<E: std::fmt::Display>(e: E) -> String {
    e.to_string()
}

// ------------------------------------------------------------------ commands

#[tauri::command]
fn get_lists(db: State<'_, AppDb>) -> Result<Vec<database::ListDto>, String> {
    let conn = db.conn()?;
    database::get_lists(conn.as_ref().unwrap()).map_err(err_string)
}

#[tauri::command]
fn list_tasks(
    db: State<'_, AppDb>,
    filter: String,
    list_id: Option<i64>,
    search: String,
) -> Result<Vec<database::TaskDto>, String> {
    let conn = db.conn()?;
    database::list_tasks(conn.as_ref().unwrap(), &filter, list_id, &search).map_err(err_string)
}

#[tauri::command]
fn get_stats(db: State<'_, AppDb>) -> Result<database::StatsDto, String> {
    let conn = db.conn()?;
    database::get_stats(conn.as_ref().unwrap()).map_err(err_string)
}

#[tauri::command]
fn create_list(
    db: State<'_, AppDb>,
    app: AppHandle,
    name: String,
    icon: String,
    color: String,
) -> Result<Vec<database::ListDto>, String> {
    let conn = db.conn()?;
    let out = database::create_list(conn.as_ref().unwrap(), &name, &icon, &color).map_err(err_string)?;
    notify_dirty(&app);
    Ok(out)
}

#[tauri::command]
fn update_list(
    db: State<'_, AppDb>,
    app: AppHandle,
    id: i64,
    name: String,
    icon: String,
    color: String,
) -> Result<(), String> {
    let conn = db.conn()?;
    database::update_list(conn.as_ref().unwrap(), id, &name, &icon, &color).map_err(err_string)?;
    notify_dirty(&app);
    Ok(())
}

#[tauri::command]
fn delete_list(db: State<'_, AppDb>, app: AppHandle, id: i64) -> Result<(), String> {
    let conn = db.conn()?;
    database::delete_list(conn.as_ref().unwrap(), id).map_err(err_string)?;
    notify_dirty(&app);
    Ok(())
}

#[tauri::command]
fn reorder_lists(db: State<'_, AppDb>, app: AppHandle, ids: Vec<i64>) -> Result<(), String> {
    let conn = db.conn()?;
    database::reorder_lists(conn.as_ref().unwrap(), ids).map_err(err_string)?;
    notify_dirty(&app);
    Ok(())
}

#[tauri::command]
fn create_task(
    db: State<'_, AppDb>,
    app: AppHandle,
    list_id: Option<i64>,
    title: String,
    notes: String,
    priority: i64,
    due_date: Option<String>,
    due_time: Option<String>,
    remind_at: Option<String>,
    repeat: Option<String>,
) -> Result<database::TaskDto, String> {
    let conn = db.conn()?;
    let out = database::create_task(
        conn.as_ref().unwrap(),
        list_id,
        &title,
        &notes,
        priority,
        due_date.as_deref(),
        due_time.as_deref(),
        remind_at.as_deref(),
        repeat.as_deref().unwrap_or(""),
    )
    .map_err(err_string)?;
    notify_dirty(&app);
    Ok(out)
}

#[tauri::command]
fn update_task(
    db: State<'_, AppDb>,
    app: AppHandle,
    id: i64,
    list_id: Option<i64>,
    title: String,
    notes: String,
    priority: i64,
    due_date: Option<String>,
    due_time: Option<String>,
    remind_at: Option<String>,
    repeat: Option<String>,
) -> Result<database::TaskDto, String> {
    let conn = db.conn()?;
    let out = database::update_task(
        conn.as_ref().unwrap(),
        id,
        list_id,
        &title,
        &notes,
        priority,
        due_date.as_deref(),
        due_time.as_deref(),
        remind_at.as_deref(),
        repeat.as_deref().unwrap_or(""),
    )
    .map_err(err_string)?;
    notify_dirty(&app);
    Ok(out)
}

#[tauri::command]
fn delete_task(db: State<'_, AppDb>, app: AppHandle, id: i64) -> Result<(), String> {
    let conn = db.conn()?;
    database::delete_task(conn.as_ref().unwrap(), id).map_err(err_string)?;
    notify_dirty(&app);
    Ok(())
}

#[tauri::command]
fn toggle_task(db: State<'_, AppDb>, app: AppHandle, id: i64) -> Result<database::TaskDto, String> {
    let conn = db.conn()?;
    let out = database::toggle_task(conn.as_ref().unwrap(), id).map_err(err_string)?;
    notify_dirty(&app);
    Ok(out)
}

#[tauri::command]
fn reorder_tasks(db: State<'_, AppDb>, app: AppHandle, ids: Vec<i64>) -> Result<(), String> {
    let conn = db.conn()?;
    database::reorder_tasks(conn.as_ref().unwrap(), ids).map_err(err_string)?;
    notify_dirty(&app);
    Ok(())
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct SubtaskInput {
    id: Option<i64>,
    title: String,
    completed: bool,
}

#[tauri::command]
fn save_subtasks(
    db: State<'_, AppDb>,
    app: AppHandle,
    task_id: i64,
    items: Vec<SubtaskInput>,
) -> Result<Vec<database::SubtaskDto>, String> {
    let conn = db.conn()?;
    let mapped: Vec<(Option<i64>, String, bool)> =
        items.into_iter().map(|i| (i.id, i.title, i.completed)).collect();
    let out = database::save_subtasks(conn.as_ref().unwrap(), task_id, mapped).map_err(err_string)?;
    notify_dirty(&app);
    Ok(out)
}

#[tauri::command]
fn get_tags(db: State<'_, AppDb>) -> Result<Vec<database::TagDto>, String> {
    let conn = db.conn()?;
    database::get_tags(conn.as_ref().unwrap()).map_err(err_string)
}

#[tauri::command]
fn create_tag(
    db: State<'_, AppDb>,
    app: AppHandle,
    name: String,
    color: String,
) -> Result<database::TagDto, String> {
    let conn = db.conn()?;
    let out = database::create_tag(conn.as_ref().unwrap(), &name, &color).map_err(err_string)?;
    notify_dirty(&app);
    Ok(out)
}

#[tauri::command]
fn set_task_tags(db: State<'_, AppDb>, app: AppHandle, task_id: i64, tag_ids: Vec<i64>) -> Result<(), String> {
    let conn = db.conn()?;
    database::set_task_tags(conn.as_ref().unwrap(), task_id, tag_ids).map_err(err_string)?;
    notify_dirty(&app);
    Ok(())
}

#[tauri::command]
fn get_setting(db: State<'_, AppDb>, key: String) -> Result<Option<String>, String> {
    let conn = db.conn()?;
    Ok(database::get_setting(conn.as_ref().unwrap(), &key))
}

#[tauri::command]
fn set_setting(db: State<'_, AppDb>, app: AppHandle, key: String, value: String) -> Result<(), String> {
    let conn = db.conn()?;
    database::set_setting_raw(conn.as_ref().unwrap(), &key, &value).map_err(err_string)?;
    notify_dirty(&app);
    Ok(())
}

#[tauri::command]
fn get_settings(db: State<'_, AppDb>) -> Result<std::collections::HashMap<String, String>, String> {
    let conn = db.conn()?;
    let mut stmt = conn
        .as_ref()
        .unwrap()
        .prepare("SELECT key, value FROM settings")
        .map_err(err_string)?;
    let mut rows = stmt.query([]).map_err(err_string)?;
    let mut out = std::collections::HashMap::new();
    while let Some(r) = rows.next().map_err(err_string)? {
        let k: String = r.get(0).map_err(err_string)?;
        let v: String = r.get(1).map_err(err_string)?;
        out.insert(k, v);
    }
    Ok(out)
}

#[tauri::command]
fn autostart_is_enabled(app: AppHandle) -> Result<bool, String> {
    app.autolaunch().is_enabled().map_err(err_string)
}

#[tauri::command]
fn autostart_set(app: AppHandle, enabled: bool) -> Result<(), String> {
    let al = app.autolaunch();
    if enabled {
        al.enable().map_err(err_string)
    } else {
        al.disable().map_err(err_string)
    }
}

// ------------------------------------------------------------------ security

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct StatusDto {
    locked: bool,
    pin_configured: bool,
}

#[tauri::command]
fn get_status(db: State<'_, AppDb>) -> Result<StatusDto, String> {
    Ok(StatusDto { locked: db.locked(), pin_configured: db.has_pin() })
}

#[tauri::command]
fn unlock(db: State<'_, AppDb>, pin: String) -> Result<(), String> {
    db.unlock(&pin)
}

#[tauri::command]
fn lock_app(db: State<'_, AppDb>) -> Result<(), String> {
    db.lock();
    Ok(())
}

#[tauri::command]
fn set_pin(db: State<'_, AppDb>, current: Option<String>, new_pin: String) -> Result<(), String> {
    db.set_pin(current.as_deref(), &new_pin)
}

#[tauri::command]
fn remove_pin(db: State<'_, AppDb>, current: String) -> Result<(), String> {
    db.remove_pin(&current)
}

// ------------------------------------------------------------------ persist loop

fn spawn_persist_loop(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        loop {
            tokio::time::sleep(Duration::from_secs(1)).await;
            let dirty = {
                let s = app.state::<DirtyState>();
                let mut g = s.0.lock().unwrap();
                match g.take() {
                    Some(last) if last.elapsed() >= Duration::from_millis(1500) => true,
                    Some(last) => {
                        *g = Some(last);
                        false
                    }
                    None => false,
                }
            };
            if dirty {
                let db = app.state::<AppDb>();
                let _ = db.persist();
            }
        }
    });
}

fn ensure_initial_lists(app: &AppHandle) {
    let db = app.state::<AppDb>();
    let conn = match db.conn() {
        Ok(c) => c,
        Err(_) => return,
    };
    let exists: bool = conn
        .as_ref()
        .unwrap()
        .query_row("SELECT COUNT(*) FROM lists", [], |r| r.get::<_, i64>(0))
        .map(|n| n > 0)
        .unwrap_or(false);
    if !exists {
        let c = conn.as_ref().unwrap();
        let _ = database::create_list(c, "Inbox", "inbox", "#0A84FF");
        let _ = database::create_list(c, "Personal", "user", "#30D158");
        let _ = database::create_list(c, "Work", "briefcase", "#5E5CE6");
    }
}

// ------------------------------------------------------------------ setup & run

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .setup(|app| {
            let dir = app.path().app_data_dir().map_err(err_string)?;
            let db = database::init_db(dir).map_err(err_string)?;
            app.manage(db);
            app.manage(DirtyState(Mutex::new(None)));

            ensure_initial_lists(app.handle());

            let handle = app.handle().clone();
            reminders::spawn_reminder_loop(handle.clone());
            spawn_persist_loop(handle.clone());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_lists,
            list_tasks,
            get_stats,
            create_list,
            update_list,
            delete_list,
            reorder_lists,
            create_task,
            update_task,
            delete_task,
            toggle_task,
            reorder_tasks,
            save_subtasks,
            get_tags,
            create_tag,
            set_task_tags,
            get_setting,
            set_setting,
            get_settings,
            autostart_is_enabled,
            autostart_set,
            get_status,
            unlock,
            lock_app,
            set_pin,
            remove_pin,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|app_handle, event| {
        if let tauri::RunEvent::ExitRequested { .. } = event {
            let db = app_handle.state::<AppDb>();
            let _ = db.persist();
        }
    });
}