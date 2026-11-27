import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import initSqlJs, { type Database, type SqlJsStatic, type SqlValue } from 'sql.js';
import schemaSql from './schema.sql?raw';

const require = createRequire(import.meta.url);

export type BindParams = SqlValue[] | Record<string, SqlValue>;

export class LocalDatabase {
  private sqlJs: SqlJsStatic | null = null;
  private db: Database | null = null;
  private dbPath: string;
  private flushTimer: NodeJS.Timeout | null = null;
  private dirty = false;

  constructor(userDataDir: string) {
    this.dbPath = path.join(userDataDir, 'new-eden-lens.sqlite');
  }

  async init(): Promise<void> {
    if (this.db) return;

    const wasmPath = require.resolve('sql.js/dist/sql-wasm.wasm');
    this.sqlJs = await initSqlJs({
      locateFile: () => wasmPath
    });

    fs.mkdirSync(path.dirname(this.dbPath), { recursive: true });
    if (fs.existsSync(this.dbPath)) {
      const fileBuffer = fs.readFileSync(this.dbPath);
      this.db = new this.sqlJs.Database(fileBuffer);
    } else {
      this.db = new this.sqlJs.Database();
    }

    this.db.run(schemaSql);
    this.runMigrations();
    this.flushNow();
  }

  private runMigrations(): void {
    const db = this.ensureDb();
    const cols = this.all<{ name: string }>('PRAGMA table_info(characters)');
    const colNames = new Set(cols.map((c) => c.name));
    if (!colNames.has('account_id')) {
      db.run('ALTER TABLE characters ADD COLUMN account_id INTEGER REFERENCES eve_accounts(id) ON DELETE SET NULL');
    }
    if (!colNames.has('is_main')) {
      db.run('ALTER TABLE characters ADD COLUMN is_main INTEGER NOT NULL DEFAULT 0');
      db.run('UPDATE characters SET is_main = is_default WHERE is_default = 1');
    }
    if (!colNames.has('description')) {
      db.run("ALTER TABLE characters ADD COLUMN description TEXT NOT NULL DEFAULT ''");
    }
    if (!colNames.has('accent_color')) {
      db.run("ALTER TABLE characters ADD COLUMN accent_color TEXT NOT NULL DEFAULT ''");
    }
    const routeCols = this.all<{ name: string }>('PRAGMA table_info(saved_routes)');
    if (!new Set(routeCols.map((c) => c.name)).has('description')) {
      db.run("ALTER TABLE saved_routes ADD COLUMN description TEXT NOT NULL DEFAULT ''");
    }
    const kgCols = this.all<{ name: string }>('PRAGMA table_info(kill_tracker_groups)');
    if (kgCols.length > 0 && !new Set(kgCols.map((c) => c.name)).has('entity_match_mode')) {
      db.run("ALTER TABLE kill_tracker_groups ADD COLUMN entity_match_mode TEXT NOT NULL DEFAULT 'any'");
    }
  }

  getSqlJs(): SqlJsStatic {
    if (!this.sqlJs) throw new Error('Database not initialized');
    return this.sqlJs;
  }

  private ensureDb(): Database {
    if (!this.db) throw new Error('Database not initialized');
    return this.db;
  }

  run(sql: string, params?: BindParams): void {
    const db = this.ensureDb();
    db.run(sql, params);
    this.scheduleFlush();
  }

  exec(sql: string): void {
    const db = this.ensureDb();
    db.exec(sql);
    this.scheduleFlush();
  }

  get<T extends Record<string, unknown>>(sql: string, params?: BindParams): T | null {
    const db = this.ensureDb();
    const stmt = db.prepare(sql);
    try {
      if (params) stmt.bind(params);
      if (stmt.step()) {
        return stmt.getAsObject() as T;
      }
      return null;
    } finally {
      stmt.free();
    }
  }

  all<T extends Record<string, unknown>>(sql: string, params?: BindParams): T[] {
    const db = this.ensureDb();
    const stmt = db.prepare(sql);
    const rows: T[] = [];
    try {
      if (params) stmt.bind(params);
      while (stmt.step()) {
        rows.push(stmt.getAsObject() as T);
      }
      return rows;
    } finally {
      stmt.free();
    }
  }

  transaction<T>(fn: (db: Database) => T): T {
    const db = this.ensureDb();
    db.run('BEGIN TRANSACTION');
    try {
      const result = fn(db);
      db.run('COMMIT');
      this.scheduleFlush();
      return result;
    } catch (err) {
      db.run('ROLLBACK');
      throw err;
    }
  }

  private scheduleFlush(): void {
    this.dirty = true;
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      this.flushNow();
    }, 600);
  }

  flushNow(): void {
    if (!this.db) return;
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    const data = this.db.export();
    const tmpPath = `${this.dbPath}.tmp`;
    fs.writeFileSync(tmpPath, Buffer.from(data));
    fs.renameSync(tmpPath, this.dbPath);
    this.dirty = false;
  }

  close(): void {
    if (this.dirty) {
      this.flushNow();
    }
    this.db?.close();
    this.db = null;
  }
}

