use std::time::Duration;

use tauri::{AppHandle, Manager};
use tauri_plugin_notification::NotificationExt;

use crate::database::{self, AppDb};

const CHECK_INTERVAL: Duration = Duration::from_secs(20);

pub fn spawn_reminder_loop(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        loop {
            check_reminders(&app);
            tokio::time::sleep(CHECK_INTERVAL).await;
        }
    });
}

fn check_reminders(app: &AppHandle) {
    let now = chrono::Local::now().format("%Y-%m-%d %H:%M").to_string();

    let db = app.state::<AppDb>();
    let conn = match db.conn() {
        Ok(c) => c,
        Err(_) => return,
    };
    let due = match database::due_reminders(conn.as_ref().unwrap(), &now) {
        Ok(d) => d,
        Err(_) => return,
    };
    if due.is_empty() {
        return;
    }

    for r in &due {
        let result = app
            .notification()
            .builder()
            .title(r.title.clone())
            .body(r.due_label.clone())
            .show();

        let _ = result;
        let _ = database::mark_reminder_notified(conn.as_ref().unwrap(), r.task_id, &now);
    }
}
