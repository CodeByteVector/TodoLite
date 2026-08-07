use std::path::PathBuf;
use std::sync::Mutex;

use chrono::{Duration, Local, NaiveDate};
use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;

use crate::crypto;

// --------------------------------------------------------- core

pub struct AppDb {
    pub dir: PathBuf,
    pub conn: Mutex<Option<Connection>>,
}

pub fn init_db(dir: PathBuf) -> Result<AppDb, String> {
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

    let enc = dir.join("todolite.db.enc");
    let plain = dir.join("todolite.db");

    // Prefer the encrypted, at-rest snapshot.
    if enc.exists() && !plain.exists() {
        decrypt_to_plain(&enc, &plain)?;
    }

    let conn = open_connection(&plain).map_err(|e| e.to_string())?;
    migrate(&conn).map_err(|e| e.to_string())?;

    Ok(AppDb { dir, conn: Mutex::new(Some(conn)) })
}

impl AppDb {
    /// Returns a locked connection, reopening (and decrypting) it if needed.
    pub fn conn(&self) -> Result<std::sync::MutexGuard<'_, Option<Connection>>, String> {
        let mut guard = self.conn.lock().map_err(|e| e.to_string())?;
        if guard.is_none() {
            let plain = self.dir.join("todolite.db");
            let enc = self.dir.join("todolite.db.enc");
            if !plain.exists() && enc.exists() {
                decrypt_to_plain(&enc, &plain)?;
            }
let c = open_connection(&plain).map_err(|e| e.to_string())?;
            migrate(&c).map_err(|e| e.to_string())?;
            *guard = Some(c);
        }
        Ok(guard)
    }

    /// Encrypt the committed database into the at-rest snapshot,
    /// delete the plaintext file and close the connection.
    pub fn persist(&self) -> Result<(), String> {
        let mut guard = self.conn.lock().map_err(|e| e.to_string())?;
        let conn = guard
            .as_ref()
            .ok_or_else(|| "no open connection to persist".to_string())?;
        let plain = self.dir.join("todolite.db");
        let enc = self.dir.join("todolite.db.enc");

        let data = std::fs::read(&plain).map_err(|e| e.to_string())?;
        let encrypted = crypto::dpapi_encrypt(&data)?;
        crypto::write_atomic(&enc, &encrypted).map_err(|e| e.to_string())?;
        let _ = std::fs::remove_file(&plain);
        let _ = conn;
        *guard = None;
        Ok(())
    }
}

fn open_connection(path: &std::path::Path) -> rusqlite::Result<Connection> {
    let conn = Connection::open(path)?;
    conn.execute_batch(
        "PRAGMA journal_mode=DELETE;
         PRAGMA synchronous=NORMAL;
         PRAGMA foreign_keys=ON;",
    )?;
    rusqlite::vtab::array::load_module(&conn)?;
    Ok(conn)
}

fn migrate(conn: &Connection) -> rusqlite::Result<()> {
    conn.execute_batch(
        r#"
        CREATE TABLE IF NOT EXISTS lists (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            icon TEXT NOT NULL DEFAULT 'list',
            color TEXT NOT NULL DEFAULT '#0A84FF',
            sort_order INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS tasks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            list_id INTEGER REFERENCES lists(id) ON DELETE SET NULL,
            title TEXT NOT NULL,
            notes TEXT NOT NULL DEFAULT '',
            priority INTEGER NOT NULL DEFAULT 0,
            due_date TEXT,
            due_time TEXT,
            remind_at TEXT,
            remind_notified TEXT,
            repeat TEXT,
            completed INTEGER NOT NULL DEFAULT 0,
            completed_at TEXT,
            sort_order INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS subtasks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
            title TEXT NOT NULL,
            completed INTEGER NOT NULL DEFAULT 0,
            sort_order INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS tags (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            color TEXT NOT NULL DEFAULT '#8E8E93'
        );

        CREATE TABLE IF NOT EXISTS task_tags (
            task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
            tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
            PRIMARY KEY (task_id, tag_id)
        );

        CREATE TABLE IF NOT EXISTS completions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            task_id INTEGER NOT NULL,
            list_id INTEGER,
            completed_day TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );
        "#,
    )
    
}

fn decrypt_to_plain(enc: &std::path::Path, plain: &std::path::Path) -> Result<(), String> {
    let blob = std::fs::read(enc).map_err(|e| e.to_string())?;
    let data = crypto::dpapi_decrypt(&blob)?;
    std::fs::write(plain, data).map_err(|e| e.to_string())?;
    Ok(())
}

// ---------------------------------------------------------- dates

fn today() -> String {
    Local::now().format("%Y-%m-%d").to_string()
}

fn d_in_days(date: &str, days: i64) -> String {
    if let Some(d) = parse_d(date) {
        return (d + Duration::days(days)).format("%Y-%m-%d").to_string();
    }
    date.to_string()
}

fn parse_d(s: &str) -> Option<NaiveDate> {
    NaiveDate::parse_from_str(s, "%Y-%m-%d").ok()
}

// ---------------------------------------------------------- DTOs

#[derive(Serialize, Clone)]
pub struct TagDto {
    pub id: i64,
    pub name: String,
    pub color: String,
}

#[derive(Serialize, Clone)]
pub struct SubtaskDto {
    pub id: i64,
    pub title: String,
    pub completed: bool,
    pub sort_order: i64,
}

#[derive(Serialize, Clone)]
pub struct TaskDto {
    pub id: i64,
    pub list_id: Option<i64>,
    pub title: String,
    pub notes: String,
    pub priority: i64,
    pub due_date: Option<String>,
    pub due_time: Option<String>,
    pub remind_at: Option<String>,
    pub repeat: String,
    pub completed: bool,
    pub completed_at: Option<String>,
    pub sort_order: i64,
    pub subtasks: Vec<SubtaskDto>,
    pub tags: Vec<TagDto>,
}

#[derive(Serialize, Clone)]
pub struct ListDto {
    pub id: i64,
    pub name: String,
    pub icon: String,
    pub color: String,
    pub sort_order: i64,
    pub total: i64,
    pub open: i64,
    pub overdue: i64,
    pub today: i64,
}

#[derive(Serialize, Default)]
pub struct StatsDto {
    pub open: i64,
    pub done: i64,
    pub overdue: i64,
    pub today_done: i64,
    pub today_open: i64,
    pub day: Vec<DayCount>,
    pub streak: i64,
    pub best_streak: i64,
    pub per_list: Vec<PerList>,
    pub total_completed_all_time: i64,
}

#[derive(Serialize, Default)]
pub struct DayCount {
    pub day: String,
    pub done: i64,
    pub created: i64,
}

#[derive(Serialize, Default)]
pub struct PerList {
    pub name: String,
    pub color: String,
    pub total: i64,
    pub done: i64,
    pub done_rate: f64,
}

// ---------------------------------------------------------------- query helpers

const TASK_COLS: &str =
    "id, list_id, title, notes, priority, due_date, due_time, remind_at, COALESCE(repeat,''), completed, completed_at, sort_order";

fn row_task(row: &rusqlite::Row) -> rusqlite::Result<TaskDto> {
    Ok(TaskDto {
        id: row.get(0)?,
        list_id: row.get(1)?,
        title: row.get(2)?,
        notes: row.get(3)?,
        priority: row.get(4)?,
        due_date: row.get(5)?,
        due_time: row.get(6)?,
        remind_at: row.get(7)?,
        repeat: row.get(8)?,
        completed: row.get::<_, i64>(9)? != 0,
        completed_at: row.get(10)?,
        sort_order: row.get(11)?,
        subtasks: Vec::new(),
        tags: Vec::new(),
    })
}

fn fetch_tasks(conn: &Connection, sql: &str, args: &[&dyn rusqlite::types::ToSql]) -> rusqlite::Result<Vec<TaskDto>> {
    let mut stmt = conn.prepare(sql)?;
    let mut rows = stmt.query(args)?;
    let mut out: Vec<TaskDto> = Vec::new();
    while let Some(row) = rows.next()? {
        out.push(row_task(row)?);
    }
    if out.is_empty() {
        return Ok(out);
    }

let ids: Vec<i64> = out.iter().map(|t| t.id).collect();
    let ids_array: rusqlite::vtab::array::Array = std::rc::Rc::new(
        ids.iter().map(|&i| rusqlite::types::Value::from(i)).collect(),
    );

    // subtasks
    {
        let mut stmt = conn
            .prepare("SELECT id, task_id, title, completed, sort_order FROM subtasks WHERE task_id IN rarray(?1) ORDER BY sort_order, id")
            ?;
        let mut rows = stmt.query(params![ids_array.clone()])?;
        while let Some(row) = rows.next()? {
            let tid: i64 = row.get(1)?;
            if let Some(t) = out.iter_mut().find(|t| t.id == tid) {
                t.subtasks.push(SubtaskDto {
                    id: row.get(0)?,
                    title: row.get(2)?,
                    completed: row.get::<_, i64>(3)? != 0,
                    sort_order: row.get(4)?,
                });
            }
        }
    }

    // tags
    {
        let mut stmt = conn
            .prepare(
                "SELECT tt.task_id, tg.id, tg.name, tg.color
                 FROM task_tags tt JOIN tags tg ON tg.id = tt.tag_id
                 WHERE tt.task_id IN rarray(?1) ORDER BY tg.name",
            )
            ?;
        let mut rows = stmt.query(params![ids_array.clone()])?;
        while let Some(row) = rows.next()? {
            let tid: i64 = row.get(0)?;
            if let Some(t) = out.iter_mut().find(|t| t.id == tid) {
                t.tags.push(TagDto {
                    id: row.get(1)?,
                    name: row.get(2)?,
                    color: row.get(3)?,
                });
            }
        }
    }

    Ok(out)
}

// ---------------------------------------------------------------- lists

pub fn get_lists(conn: &Connection) -> rusqlite::Result<Vec<ListDto>> {
    let mut stmt = conn
        .prepare(
            "SELECT l.id, l.name, l.icon, l.color, l.sort_order,
                    COUNT(t.id),
                    COALESCE(SUM(CASE WHEN t.completed = 0 THEN 1 ELSE 0 END), 0),
                    COALESCE(SUM(CASE WHEN t.completed = 0 AND t.due_date IS NOT NULL AND t.due_date < ? THEN 1 ELSE 0 END), 0),
                    COALESCE(SUM(CASE WHEN t.completed = 0 AND t.due_date = ? THEN 1 ELSE 0 END), 0)
             FROM lists l LEFT JOIN tasks t ON t.list_id = l.id
             GROUP BY l.id ORDER BY l.sort_order, l.id",
        )
        ?;
    let mut rows = stmt.query(params![today(), today()])?;
    let mut out = Vec::new();
    while let Some(r) = rows.next()? {
        out.push(ListDto {
            id: r.get(0)?,
            name: r.get(1)?,
            icon: r.get(2)?,
            color: r.get(3)?,
            sort_order: r.get(4)?,
            total: r.get(5)?,
            open: r.get(6)?,
            overdue: r.get(7)?,
            today: r.get(8)?,
        });
    }
    Ok(out)
}

// ---------------------------------------------------------------- tasks

pub fn list_tasks(
    conn: &Connection,
    filter: &str,
    list_id: Option<i64>,
    search: &str,
) -> rusqlite::Result<Vec<TaskDto>> {
    let t = today();
    let mut sql = format!("SELECT {TASK_COLS} FROM tasks WHERE completed = 0");
    let mut args: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();

    if let Some(lid) = list_id {
        sql.push_str(" AND list_id = ?");
        args.push(Box::new(lid));
    }

    match filter {
        "today" => {
            sql.push_str(" AND COALESCE(due_date,'') = ?");
            args.push(Box::new(t.clone()));
        }
        "planned" => sql.push_str(" AND due_date IS NOT NULL"),
        "overdue" => {
            sql.push_str(" AND COALESCE(due_date,'') < ?");
            args.push(Box::new(t.clone()));
        }
        "7days" => {
            sql.push_str(" AND due_date IS NOT NULL AND due_date <= ?");
            args.push(Box::new(d_in_days(&t, 7)));
        }
        _ => {}
    }

    if !search.trim().is_empty() {
        sql.push_str(" AND (lower(title) LIKE '%' || lower(?) || '%' OR lower(notes) LIKE '%' || lower(?) || '%')");
        args.push(Box::new(search.trim().to_string()));
        args.push(Box::new(search.trim().to_string()));
    }

    sql.push_str(" ORDER BY sort_order, id");

    let refs: Vec<&dyn rusqlite::types::ToSql> = args.iter().map(|b| b.as_ref()).collect();
    fetch_tasks(conn, &sql, &refs)
}

pub fn get_task(conn: &Connection, id: i64) -> rusqlite::Result<Option<TaskDto>> {
    let sql = format!(
        "SELECT {TASK_COLS} FROM tasks WHERE id = ?"
    );
    let mut tasks = fetch_tasks(conn, &sql, &[&id])?;
    Ok(tasks.pop())
}

pub fn create_task(
    conn: &Connection,
    list_id: Option<i64>,
    title: &str,
    notes: &str,
    priority: i64,
    due_date: Option<&str>,
    due_time: Option<&str>,
    remind_at: Option<&str>,
    repeat: &str,
) -> rusqlite::Result<TaskDto> {
    let max: i64 = conn
        .query_row(
            "SELECT COALESCE(MAX(sort_order), -1) + 1 FROM tasks WHERE completed = 0",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    conn.execute(
        "INSERT INTO tasks (list_id, title, notes, priority, due_date, due_time, remind_at, repeat, sort_order)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        params![list_id, title, notes, priority, due_date, due_time, remind_at, repeat, max],
    )
    ?;
    let id = conn.last_insert_rowid();
    Ok(get_task(conn, id)?.unwrap())
}

#[allow(clippy::too_many_arguments)]
pub fn update_task(
    conn: &Connection,
    id: i64,
    list_id: Option<i64>,
    title: &str,
    notes: &str,
    priority: i64,
    due_date: Option<&str>,
    due_time: Option<&str>,
    remind_at: Option<&str>,
    repeat: &str,
) -> rusqlite::Result<TaskDto> {
    conn.execute(
        "UPDATE tasks SET list_id=?1, title=?2, notes=?3, priority=?4, due_date=?5, due_time=?6, remind_at=?7, repeat=?8, remind_notified=NULL WHERE id=?9",
        params![list_id, title, notes, priority, due_date, due_time, remind_at, repeat, id],
    )
    ?;
    Ok(get_task(conn, id)?.unwrap())
}

pub fn delete_task(conn: &Connection, id: i64) -> rusqlite::Result<()> {
    conn.execute("DELETE FROM tasks WHERE id = ?", params![id])?;
    Ok(())
}

pub fn toggle_task(conn: &Connection, id: i64) -> rusqlite::Result<TaskDto> {
    let (completed, repeat, due_date, _due_time): (i64, String, Option<String>, Option<String>) = conn
        .query_row(
            "SELECT completed, COALESCE(repeat,''), due_date, due_time FROM tasks WHERE id=?",
            params![id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
        )
        ?;

    if completed == 1 {
        conn.execute("UPDATE tasks SET completed=0, completed_at=NULL WHERE id=?", params![id])
            ?;
        conn.execute("DELETE FROM completions WHERE task_id=?", params![id])?;
    } else {
        let today_s = today();
        let list_id: Option<i64> = conn
            .query_row("SELECT list_id FROM tasks WHERE id=?", params![id], |r| r.get(0))
            ?;
        conn.execute(
            "INSERT INTO completions (task_id, list_id, completed_day) VALUES (?1, ?2, ?3)",
            params![id, list_id, today_s],
        )
        ?;
        conn.execute("UPDATE tasks SET completed=1, completed_at=?1 WHERE id=?2", params![today_s, id])
            ?;

        // handle repeating tasks: roll forward instead of completing
        if repeat == "DAILY" || repeat == "WEEKLY" || repeat == "MONTHLY" || repeat == "YEARLY" {
            let next = next_due(&due_date, &repeat);
            conn.execute(
                "UPDATE tasks SET completed=0, completed_at=NULL, due_date=?1, remind_notified=NULL WHERE id=?2",
                params![next, id],
            )
            ?;
        }
    }
    let task = get_task(conn, id)?.unwrap();
    Ok(task)
}

fn next_due(due_date: &Option<String>, repeat: &str) -> Option<String> {
    let d = due_date.as_deref().and_then(parse_d)?;
    let n = match repeat {
        "DAILY" => d + Duration::days(1),
        "WEEKLY" => d + Duration::weeks(1),
        "MONTHLY" => add_months(d, 1),
        "YEARLY" => d.checked_add_months(chrono::Months::new(12)).unwrap_or(d),
        _ => d,
    };
    Some(n.format("%Y-%m-%d").to_string())
}

fn add_months(d: NaiveDate, months: u32) -> NaiveDate {
    d.checked_add_months(chrono::Months::new(months)).unwrap_or(d)
}

pub fn reorder_tasks(conn: &Connection, ids: Vec<i64>) -> rusqlite::Result<()> {
    for (i, id) in ids.iter().enumerate() {
        conn.execute("UPDATE tasks SET sort_order=?1 WHERE id=?2", params![i as i64, id])
            ?;
    }
    Ok(())
}

// ---------------------------------------------------------------- subtasks

pub fn save_subtasks(conn: &Connection, task_id: i64, items: Vec<(Option<i64>, String, bool)>) -> rusqlite::Result<Vec<SubtaskDto>> {
    // remove subtasks that are no longer present
    let keep: Vec<i64> = items.iter().filter_map(|(id, _, _)| *id).collect();
    let keep_array: rusqlite::vtab::array::Array = std::rc::Rc::new(
        keep.iter().map(|&i| rusqlite::types::Value::from(i)).collect(),
    );
    conn.execute(
        "DELETE FROM subtasks WHERE task_id=?1 AND id NOT IN rarray(?2)",
        params![task_id, keep_array],
    )?;
    let mut order = 0i64;
    for (id, title, completed) in items {
        match id {
            Some(i) => {
                conn.execute(
                    "UPDATE subtasks SET title=?1, completed=?2, sort_order=?3 WHERE id=?4",
                    params![title, completed as i64, order, i],
                )
                ?;
            }
            None => {
                conn.execute(
                    "INSERT INTO subtasks (task_id, title, completed, sort_order) VALUES (?1,?2,?3,?4)",
                    params![task_id, title, completed as i64, order],
                )
                ?;
            }
        }
        order += 1;
    }
    let sql = "SELECT id, title, completed, sort_order FROM subtasks WHERE task_id=? ORDER BY sort_order, id";
    let mut stmt = conn.prepare(sql)?;
    let mut rows = stmt.query(params![task_id])?;
    let mut out = Vec::new();
    while let Some(r) = rows.next()? {
        out.push(SubtaskDto {
            id: r.get(0)?,
            title: r.get(1)?,
            completed: r.get::<_, i64>(2)? != 0,
            sort_order: r.get(3)?,
        });
    }
    Ok(out)
}

// ---------------------------------------------------------------- tags

pub fn get_tags(conn: &Connection) -> rusqlite::Result<Vec<TagDto>> {
    let mut stmt = conn
        .prepare("SELECT id, name, color FROM tags ORDER BY name")
        ?;
    let mut rows = stmt.query([])?;
    let mut out = Vec::new();
    while let Some(r) = rows.next()? {
        out.push(TagDto { id: r.get(0)?, name: r.get(1)?, color: r.get(2)? });
    }
    Ok(out)
}

pub fn create_tag(conn: &Connection, name: &str, color: &str) -> rusqlite::Result<TagDto> {
conn.execute("INSERT OR IGNORE INTO tags (name, color) VALUES (?1, ?2)", params![name.trim(), color])
        ?;
    // If IGNORE happened (name exists), last_insert_rowid is stale.
    let tag = conn
        .query_row("SELECT id, name, color FROM tags WHERE name=?1", params![name.trim()], |r| {
            Ok(TagDto { id: r.get(0)?, name: r.get(1)?, color: r.get(2)? })
        })
        ?;
    Ok(tag)
}

pub fn set_task_tags(conn: &Connection, task_id: i64, tag_ids: Vec<i64>) -> rusqlite::Result<()> {
    conn.execute("DELETE FROM task_tags WHERE task_id=?1", params![task_id])?;
    for tid in tag_ids {
        conn.execute(
            "INSERT OR IGNORE INTO task_tags (task_id, tag_id) VALUES (?1, ?2)",
            params![task_id, tid],
        )
        ?;
    }
    Ok(())
}

// ---------------------------------------------------------------- lists CRUD

pub fn create_list(conn: &Connection, name: &str, icon: &str, color: &str) -> rusqlite::Result<Vec<ListDto>> {
    conn.execute(
        "INSERT INTO lists (name, icon, color) VALUES (?1, ?2, ?3)",
        params![name, icon, color],
    )
    ?;
    get_lists(conn)
}

pub fn update_list(conn: &Connection, id: i64, name: &str, icon: &str, color: &str) -> rusqlite::Result<()> {
    conn.execute(
        "UPDATE lists SET name=?1, icon=?2, color=?3 WHERE id=?4",
        params![name, icon, color, id],
    )
    ?;
    Ok(())
}

pub fn delete_list(conn: &Connection, id: i64) -> rusqlite::Result<()> {
    conn.execute("UPDATE tasks SET list_id=NULL WHERE list_id=?1", params![id])?;
    conn.execute("DELETE FROM lists WHERE id=?1", params![id])?;
    Ok(())
}

pub fn reorder_lists(conn: &Connection, ids: Vec<i64>) -> rusqlite::Result<()> {
    for (i, id) in ids.iter().enumerate() {
        conn.execute("UPDATE lists SET sort_order=?1 WHERE id=?2", params![i as i64, id])
            ?;
    }
    Ok(())
}

// ---------------------------------------------------------------- reminders

#[derive(Serialize, Clone)]
pub struct DueReminder {
    pub task_id: i64,
    pub title: String,
    pub due_label: String,
}

/// Tasks whose reminder time has passed and that have not been notified yet.
pub fn due_reminders(conn: &Connection, now: &str) -> rusqlite::Result<Vec<DueReminder>> {
    let mut stmt = conn
        .prepare(
            "SELECT t.id, t.title, t.due_date, t.due_time
             FROM tasks t
             WHERE t.completed = 0
               AND t.remind_at IS NOT NULL
               AND t.remind_at <= ?1
               AND t.remind_notified IS NULL",
        )
        ?;
    let mut rows = stmt.query(params![now])?;
    let mut out = Vec::new();
    while let Some(r) = rows.next()? {
        let due_date: Option<String> = r.get(2)?;
        let due_time: Option<String> = r.get(3)?;
        let due_label = match (&due_date, &due_time) {
            (Some(d), Some(t)) => format!("Due {d} at {t}"),
            (Some(d), None) => format!("Due {d}"),
            _ => "Reminder".to_string(),
        };
        out.push(DueReminder {
            task_id: r.get(0)?,
            title: r.get(1)?,
            due_label,
        });
    }
    Ok(out)
}

pub fn mark_reminder_notified(conn: &Connection, task_id: i64, now: &str) -> rusqlite::Result<()> {
    conn.execute(
        "UPDATE tasks SET remind_notified=?1 WHERE id=?2",
        params![now, task_id],
    )
    ?;
    Ok(())
}

pub fn get_setting(conn: &Connection, key: &str) -> Option<String> {
    conn.query_row("SELECT value FROM settings WHERE key=?1", params![key], |r| r.get(0))
        .optional()
        .unwrap_or(None)
}

pub fn set_setting_raw(conn: &Connection, key: &str, value: &str) -> rusqlite::Result<()> {
    conn.execute(
        "INSERT INTO settings (key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![key, value],
    )
    ?;
    Ok(())
}

// ---------------------------------------------------------------- stats

pub fn get_stats(conn: &Connection) -> rusqlite::Result<StatsDto> {
    let t = today();
    let open: i64 = conn
        .query_row("SELECT COUNT(*) FROM tasks WHERE completed=0", [], |r| r.get(0))
        ?;
    let done: i64 = conn
        .query_row("SELECT COUNT(*) FROM tasks WHERE completed=1", [], |r| r.get(0))
        ?;
    let overdue: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM tasks WHERE completed=0 AND COALESCE(due_date,'') < ?1",
            params![t],
            |r| r.get(0),
        )
        ?;
    let today_done: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM completions WHERE completed_day = ?1",
            params![t],
            |r| r.get(0),
        )
        ?;
    let today_open: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM tasks WHERE completed=0 AND COALESCE(due_date,'') = ?1",
            params![t],
            |r| r.get(0),
        )
        ?;

    // last 14 days
    let mut day: Vec<DayCount> = Vec::new();
    let start = d_in_days(&t, -13);
    {
        let mut stmt = conn
            .prepare("SELECT completed_day, COUNT(*) FROM completions WHERE completed_day >= ?1 GROUP BY completed_day")
            ?;
        let mut m: std::collections::HashMap<String, i64> = std::collections::HashMap::new();
        let mut rows = stmt.query(params![&start])?;
        while let Some(r) = rows.next()? {
            m.insert(r.get(0)?, r.get(1)?);
        }
        let mut c = start.clone();
        for _ in 0..14 {
            let done_d = m.get(&c).copied().unwrap_or(0);
            day.push(DayCount { day: c.clone(), done: done_d, created: 0 });
            c = d_in_days(&c, 1);
        }
    }

    // streak
    let (streak, best) = compute_streaks(conn, &t)?;

    // per list
    let mut per_list: Vec<PerList> = Vec::new();
    {
        let mut stmt = conn
            .prepare(
                "SELECT l.name, l.color,
                        COUNT(t.id),
                        COALESCE(SUM(CASE WHEN t.completed=1 THEN 1 ELSE 0 END),0)
                 FROM lists l LEFT JOIN tasks t ON t.list_id = l.id
                 GROUP BY l.id",
            )
            ?;
        let mut rows = stmt.query([])?;
        while let Some(r) = rows.next()? {
            let total: i64 = r.get(2)?;
            let done_d: i64 = r.get(3)?;
            per_list.push(PerList {
                name: r.get(0)?,
                color: r.get(1)?,
                total,
                done: done_d,
                done_rate: if total > 0 { done_d as f64 / total as f64 } else { 0.0 },
            });
        }
    }

    // total completions ever
    let total_completed_all_time: i64 = conn
        .query_row("SELECT COUNT(*) FROM completions", [], |r| r.get(0))
        ?;

    Ok(StatsDto {
        open,
        done,
        overdue,
        today_done,
        today_open,
        day,
        streak,
        best_streak: best,
        per_list,
        total_completed_all_time,
    })
}

fn compute_streaks(conn: &Connection, t: &str) -> rusqlite::Result<(i64, i64)> {
    let mut stmt = conn
        .prepare("SELECT DISTINCT completed_day FROM completions ORDER BY completed_day DESC")
        ?;
    let days: Vec<String> = stmt
        .query_map([], |r| r.get::<_, String>(0))
        ?
        .collect::<Result<_, _>>()
        ?;

    let tdate = parse_d(t).unwrap_or_else(|| Local::now().date_naive());
    let set: std::collections::HashSet<String> = days.iter().cloned().collect();

    // current streak: count back from today or yesterday if today has no completions yet
    let mut cur = 0i64;
    let mut anchor = tdate;
    if !set.contains(&tdate.format("%Y-%m-%d").to_string()) {
        let y = tdate.pred_opt().unwrap();
        if !set.contains(&y.format("%Y-%m-%d").to_string()) {
            anchor = tdate; // nothing today or yesterday -> streak 0
            cur = -1;
        } else {
            anchor = y;
        }
    }
    if cur >= 0 {
        let mut d = anchor;
        loop {
            let s = d.format("%Y-%m-%d").to_string();
            if set.contains(&s) {
                cur += 1;
            } else {
                break;
            }
            match d.pred_opt() {
                Some(p) => d = p,
                None => break,
            }
        }
    }
    if cur < 0 {
        cur = 0;
    }

    // best streak
    let mut best = 0i64;
    {
        let dates: Vec<NaiveDate> = days
            .iter()
            .filter_map(|s| parse_d(s))
            .collect::<std::collections::HashSet<_>>()
            .into_iter()
            .collect();
        let mut sorted: Vec<NaiveDate> = dates;
        sorted.sort();
        let mut run = 0i64;
        let mut prev: Option<NaiveDate> = None;
        for d in sorted {
            match prev {
                Some(p) if (d - p).num_days() == 1 => run += 1,
                Some(_) => run = 1,
                None => run = 1,
            }
            prev = Some(d);
            if run > best {
                best = run;
            }
        }
    }
    Ok((cur, best))
}

