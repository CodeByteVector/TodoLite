use std::path::PathBuf;
use std::sync::Mutex;

use chrono::{Duration, Local, NaiveDate};
use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;

use crate::crypto;

// --------------------------------------------------------- core

const DB_FILE: &str = "todolite.db";
const PIN_FILE: &str = "master.pin";
const DPAPI_FILE: &str = "master.dpapi";
const MASTER_KEY_LEN: usize = crypto::MASTER_KEY_LEN;

pub struct AppDb {
    pub dir: PathBuf,
    conn: Mutex<Option<Connection>>,
    key: Mutex<Option<[u8; MASTER_KEY_LEN]>>,
}

/// Initialise the database and keyring.
///
/// * First run: a random master key is generated and wrapped with Windows DPAPI.
/// * PIN configured: the database stays sealed until `unlock` succeeds.
/// * Otherwise the key is unwrapped from DPAPI and the database is opened.
pub fn init_db(dir: PathBuf) -> Result<AppDb, String> {
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

    let db = AppDb {
        dir,
        conn: Mutex::new(None),
        key: Mutex::new(None),
    };

    if db.has_pin() {
        return Ok(db);
    }

    let master: [u8; MASTER_KEY_LEN] = {
        let dpapi_path = db.dir.join(DPAPI_FILE);
        if dpapi_path.exists() {
            let blob = std::fs::read(&dpapi_path).map_err(|e| e.to_string())?;
            crypto::dpapi_decrypt(&blob)?
                .try_into()
                .map_err(|_| "stored master key has an unexpected size".to_string())?
        } else {
            let key = crypto::generate_master_key();
            let blob = crypto::dpapi_encrypt(&key)?;
            crypto::write_atomic(&dpapi_path, &blob).map_err(|e| e.to_string())?;
            key
        }
    };

    *db.key.lock().unwrap() = Some(master);
    db.open()?;
    Ok(db)
}

impl AppDb {
    pub fn db_path(&self) -> PathBuf {
        self.dir.join(DB_FILE)
    }

    pub fn has_pin(&self) -> bool {
        self.dir.join(PIN_FILE).exists()
    }

    /// True when a PIN is configured and the database is not yet unlocked.
    pub fn locked(&self) -> bool {
        self.has_pin() && self.key.lock().map(|k| k.is_none()).unwrap_or(true)
    }

    /// Open (or reopen) the encrypted connection if a master key is available.
    pub fn open(&self) -> Result<(), String> {
        let mut guard = self.conn.lock().map_err(|e| e.to_string())?;
        if guard.is_some() {
            return Ok(());
        }
        let key = self
            .key
            .lock()
            .map_err(|e| e.to_string())?
            .ok_or_else(|| "database is locked".to_string())?;
        let conn = open_sqlite(&self.db_path(), &key).map_err(|e| e.to_string())?;
        migrate(&conn).map_err(|e| e.to_string())?;
        *guard = Some(conn);
        Ok(())
    }

    /// Returns a locked connection, reopening the encrypted database if needed.
    pub fn conn(&self) -> Result<std::sync::MutexGuard<'_, Option<Connection>>, String> {
        self.open()?;
        self.conn.lock().map_err(|e| e.to_string())
    }

    /// Durability safety barrier. Data is written encrypted and committed by
    /// every command, so no snapshot is required; this only flushes the journal.
    pub fn persist(&self) -> Result<(), String> {
        let guard = self.conn.lock().map_err(|e| e.to_string())?;
        if let Some(c) = guard.as_ref() {
            let _ = c.execute_batch("PRAGMA wal_checkpoint(TRUNCATE);");
        }
        Ok(())
    }

    /// Unseal the master key with the PIN and open the database.
    pub fn unlock(&self, pin: &str) -> Result<(), String> {
        if !self.locked() {
            return Ok(());
        }
        let master = self.unseal_key_with_pin(pin)?;
        *self.key.lock().unwrap() = Some(master);
        self.open()
    }

    /// Lock the app: close the connection and wipe the master key from memory.
    /// Only meaningful when a PIN is configured.
    pub fn lock(&self) {
        if !self.has_pin() {
            return;
        }
        *self.conn.lock().unwrap() = None;
        let mut key = self.key.lock().unwrap();
        if let Some(mut k) = key.take() {
            crypto::wipe(&mut k);
        }
    }

    /// Set or change the PIN: the master key is re-sealed under the new PIN.
    /// When a PIN is already active, `current` must be correct.
    pub fn set_pin(&self, current: Option<&str>, new_pin: &str) -> Result<(), String> {
        let master: [u8; MASTER_KEY_LEN] = {
            let guard = self.key.lock().unwrap();
            match *guard {
                Some(m) => m,
                None => self.unseal_key_with_pin(
                    current.ok_or_else(|| "current PIN required".to_string())?,
                )?,
            }
        };
        let salt = crypto::random_bytes(crypto::SALT_LEN);
        let pin_key = crypto::derive_pin_key(new_pin, &salt)?;
        let (nonce, ciphertext) = crypto::aes_gcm_encrypt(&pin_key, &master)?;

        let mut out = Vec::with_capacity(crypto::SALT_LEN + nonce.len() + ciphertext.len());
        out.extend_from_slice(&salt);
        out.extend_from_slice(&nonce);
        out.extend_from_slice(&ciphertext);
        crypto::write_atomic(&self.dir.join(PIN_FILE), &out).map_err(|e| e.to_string())?;
        let _ = std::fs::remove_file(self.dir.join(DPAPI_FILE));

        if self.key.lock().unwrap().is_none() {
            *self.key.lock().unwrap() = Some(master);
        }
        Ok(())
    }

    /// Remove the PIN: the master key is re-wrapped with DPAPI after verifying
    /// the current PIN.
    pub fn remove_pin(&self, current: &str) -> Result<(), String> {
        let master = self.unseal_key_with_pin(current)?;
        let blob = crypto::dpapi_encrypt(&master)?;
        crypto::write_atomic(&self.dir.join(DPAPI_FILE), &blob).map_err(|e| e.to_string())?;
        let _ = std::fs::remove_file(self.dir.join(PIN_FILE));
        if self.key.lock().unwrap().is_none() {
            *self.key.lock().unwrap() = Some(master);
        }
        Ok(())
    }

    fn unseal_key_with_pin(&self, pin: &str) -> Result<[u8; MASTER_KEY_LEN], String> {
        let path = self.dir.join(PIN_FILE);
        let data = std::fs::read(&path).map_err(|e| e.to_string())?;
        if data.len() < crypto::SALT_LEN + crypto::NONCE_LEN {
            return Err("PIN file is corrupt".to_string());
        }
        let (salt, rest) = data.split_at(crypto::SALT_LEN);
        let (nonce, ciphertext) = rest.split_at(crypto::NONCE_LEN);
        let pin_key = crypto::derive_pin_key(pin, salt)?;
        let plain = crypto::aes_gcm_decrypt(&pin_key, nonce, ciphertext)
            .map_err(|_| "Incorrect PIN".to_string())?;
        plain
            .try_into()
            .map_err(|_| "stored master key has an unexpected size".to_string())
    }
}

/// Open the database with SQLCipher AES-256 encryption using the master key.
/// Every byte on disk (data, journal, temp) is encrypted - there is no
/// plaintext phase.
fn open_sqlite(path: &std::path::Path, key: &[u8; MASTER_KEY_LEN]) -> rusqlite::Result<Connection> {
    let conn = Connection::open(path)?;
    let hex: String = key.iter().map(|b| format!("{:02x}", b)).collect();
    conn.execute_batch(&format!(
        "PRAGMA key = \"x'{hex}'\";
         PRAGMA secure_delete = ON;
         PRAGMA journal_mode = DELETE;
         PRAGMA synchronous = NORMAL;
         PRAGMA foreign_keys = ON;"
    ))?;
    // Force a read to verify the key is correct before use.
    conn.query_row("SELECT count(*) FROM sqlite_master", [], |r| r.get::<_, i64>(0))
        .map_err(|e| e)?;
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
#[serde(rename_all = "camelCase")]
pub struct TagDto {
    pub id: i64,
    pub name: String,
    pub color: String,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SubtaskDto {
    pub id: i64,
    pub title: String,
    pub completed: bool,
    pub sort_order: i64,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
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
#[serde(rename_all = "camelCase")]
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
#[serde(rename_all = "camelCase")]
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
#[serde(rename_all = "camelCase")]
pub struct DayCount {
    pub day: String,
    pub done: i64,
    pub created: i64,
}

#[derive(Serialize, Default)]
#[serde(rename_all = "camelCase")]
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

// ---------------------------------------------------------------- tests

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn fresh_start_creates_encrypted_db_and_crud_works() {
        let dir = tempdir().unwrap();
        let db = init_db(dir.path().to_path_buf()).unwrap();
        assert!(!db.has_pin());
        assert!(!db.locked());

        let conn = db.conn().unwrap();
        let c = conn.as_ref().unwrap();
        let lists = create_list(c, "Test", "inbox", "#0A84FF").unwrap();
        assert_eq!(lists.len(), 1);

        let t = create_task(c, Some(lists[0].id), "Buy milk", "", 0, None, None, None, "").unwrap();
        assert_eq!(t.title, "Buy milk");
        assert_eq!(list_tasks(c, "", Some(lists[0].id), "").unwrap().len(), 1);

        // The on-disk database must NOT be plaintext SQLite.
        let bytes = std::fs::read(db.db_path()).unwrap();
        assert!(
            !bytes.starts_with(b"SQLite format 3\x00"),
            "database file must be encrypted at rest"
        );
    }

    #[test]
    fn pin_seals_key_and_locks_database() {
        let dir = tempdir().unwrap();
        let db = init_db(dir.path().to_path_buf()).unwrap();
        db.set_pin(None, "1234").unwrap();
        assert!(db.has_pin());

        // The PIN file stores salt+nonce+ciphertext, never the raw key.
        let pin_bytes = std::fs::read(dir.path().join(PIN_FILE)).unwrap();
        assert_eq!(pin_bytes.len(), crypto::SALT_LEN + crypto::NONCE_LEN + 32 + 16);
        assert!(!db.dir.join(DPAPI_FILE).exists(), "DPAPI wrapper must be removed when PIN is active");

        // Lock: connection closes, key is wiped from memory.
        db.lock();
        assert!(db.locked());
        assert!(db.conn().is_err(), "commands must fail while locked");

        // Wrong PIN must not unlock.
        assert!(db.unlock("0000").is_err());
        assert!(db.locked());

        // Correct PIN unlocks and the database works.
        db.unlock("1234").unwrap();
        assert!(!db.locked());
        let conn = db.conn().unwrap();
        create_list(conn.as_ref().unwrap(), "Sealed", "lock", "#0A84FF").unwrap();
    }

    #[test]
    fn remove_pin_requires_current_pin_and_restores_dpapi() {
        let dir = tempdir().unwrap();
        let db = init_db(dir.path().to_path_buf()).unwrap();
        db.set_pin(None, "9876").unwrap();
        db.lock();

        assert!(db.remove_pin("0000").is_err(), "removing with a wrong PIN must fail");
        db.remove_pin("9876").unwrap();
        assert!(!db.has_pin());
        assert!(db.dir.join(DPAPI_FILE).exists());

        // Simulate a restart: a fresh instance opens straight away, no PIN.
        let db2 = init_db(dir.path().to_path_buf()).unwrap();
        assert!(!db2.locked());
        assert!(db2.conn().is_ok());
    }

    #[test]
    fn change_pin_requires_current_pin() {
        let dir = tempdir().unwrap();
        let db = init_db(dir.path().to_path_buf()).unwrap();
        db.set_pin(None, "1111").unwrap();
        db.lock();

        assert!(db.set_pin(Some("9999"), "2222").is_err());
        db.set_pin(Some("1111"), "2222").unwrap();
        db.lock();
        assert!(db.unlock("2222").is_ok());
    }
}

