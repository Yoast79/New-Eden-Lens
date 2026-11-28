import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';

const MAX_MEMORY_ENTRIES = 120;
const MAX_FILE_BYTES = 512 * 1024;

function scrubSensitive(text: string): string {
  return text
    .replace(/Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi, 'Bearer [REDACTED]')
    .replace(/(access_token|refresh_token|client_secret)["':=\s]+[^\s"',}]+/gi, '$1=[REDACTED]')
    .replace(/https:\/\/discord\.com\/api\/webhooks\/[^\s"']+/gi, 'https://discord.com/api/webhooks/[REDACTED]');
}

class ErrorLoggerService {
  private entries: string[] = [];
  private initialized = false;
  private logFilePath: string | null = null;

  init(): void {
    if (this.initialized) return;
    this.initialized = true;

    try {
      const logDir = path.join(app.getPath('userData'), 'logs');
      fs.mkdirSync(logDir, { recursive: true });
      this.logFilePath = path.join(logDir, 'new-eden-lens-errors.log');
      if (fs.existsSync(this.logFilePath)) {
        const stat = fs.statSync(this.logFilePath);
        if (stat.size > MAX_FILE_BYTES) {
          fs.writeFileSync(this.logFilePath, '', 'utf8');
        }
      }
    } catch {
      this.logFilePath = null;
    }

    const origError = console.error.bind(console);
    console.error = (...args: unknown[]) => {
      origError(...args);
      this.record('MAIN_ERROR', args.map(formatArg).join(' '));
    };

    const origWarn = console.warn.bind(console);
    console.warn = (...args: unknown[]) => {
      origWarn(...args);
      this.record('MAIN_WARN', args.map(formatArg).join(' '));
    };

    process.on('uncaughtException', (err) => {
      this.record('UNCAUGHT_EXCEPTION', err.stack ?? err.message);
    });

    process.on('unhandledRejection', (reason) => {
      this.record('UNHANDLED_REJECTION', formatArg(reason));
    });
  }

  record(source: string, message: string): void {
    const line = `[${new Date().toISOString()}] [${source}] ${scrubSensitive(message)}`;
    this.entries.push(line);
    if (this.entries.length > MAX_MEMORY_ENTRIES) {
      this.entries.shift();
    }
    if (this.logFilePath) {
      try {
        fs.appendFileSync(this.logFilePath, `${line}\n`, 'utf8');
      } catch {
        // ignore disk write errors
      }
    }
  }

  getFormattedLog(): string {
    const header = [
      `New Eden Lens v${app.getVersion()} (${process.platform} ${process.arch})`,
      `Generated: ${new Date().toISOString()}`,
      `---`
    ].join('\n');

    let body = this.entries.join('\n');
    if (!body && this.logFilePath && fs.existsSync(this.logFilePath)) {
      try {
        const raw = fs.readFileSync(this.logFilePath, 'utf8').trim();
        if (raw) {
          const lines = raw.split('\n');
          body = lines.slice(-60).join('\n');
        }
      } catch {
        // ignore
      }
    }

    if (!body) {
      body = 'No errors or warnings recorded in this session.';
    }

    return `${header}\n${body}`;
  }
}

function formatArg(arg: unknown): string {
  if (arg instanceof Error) return arg.stack ?? arg.message;
  if (typeof arg === 'string') return arg;
  try {
    return JSON.stringify(arg);
  } catch {
    return String(arg);
  }
}

export const errorLogger = new ErrorLoggerService();

