import * as fs from 'node:fs';
import * as path from 'node:path';

const WATCH_EXTENSIONS = new Set(['.cpp', '.cc', '.cxx', '.c++', '.h', '.hpp', '.hxx', '.json']);
const IGNORED_DIRS = new Set(['.git', 'node_modules', 'dist', 'build', 'target']);

export interface WatcherOptions {
  targets: string[];
  onChange: (changedPath: string) => Promise<void> | void;
  debounceMs?: number;
}

export class FileWatcher {
  private watchers: fs.FSWatcher[] = [];
  private debounceTimer: NodeJS.Timeout | null = null;
  private isProcessing = false;
  private pendingPath: string | null = null;

  constructor(private options: WatcherOptions) {}

  public start(): void {
    const { targets, debounceMs = 200 } = this.options;
    const dirsToWatch = new Set<string>();

    for (const target of targets) {
      if (fs.existsSync(target)) {
        const stat = fs.statSync(target);
        if (stat.isDirectory()) {
          dirsToWatch.add(path.resolve(target));
        } else {
          dirsToWatch.add(path.resolve(path.dirname(target)));
        }
      } else {
        // Parent folder may exist
        const parent = path.resolve(path.dirname(target));
        if (fs.existsSync(parent)) {
          dirsToWatch.add(parent);
        }
      }
    }

    if (dirsToWatch.size === 0) {
      dirsToWatch.add(process.cwd());
    }

    for (const dir of dirsToWatch) {
      try {
        const watcher = fs.watch(
          dir,
          { recursive: true },
          (_eventType, filename) => {
            if (!filename) return;

            // Ignore intermediate directories
            const parts = filename.split(/[/\\]/);
            if (parts.some((p) => IGNORED_DIRS.has(p))) {
              return;
            }

            const ext = path.extname(filename).toLowerCase();
            if (!WATCH_EXTENSIONS.has(ext)) {
              return;
            }

            const fullPath = path.join(dir, filename);
            this.pendingPath = fullPath;

            if (this.debounceTimer) {
              clearTimeout(this.debounceTimer);
            }

            this.debounceTimer = setTimeout(async () => {
              if (this.isProcessing) return;
              this.isProcessing = true;
              try {
                if (this.pendingPath) {
                  await this.options.onChange(this.pendingPath);
                }
              } catch (err) {
                console.error('Error handling file change:', err);
              } finally {
                this.isProcessing = false;
              }
            }, debounceMs);
          }
        );

        this.watchers.push(watcher);
      } catch (err) {
        console.warn(`Warning: Could not attach recursive watcher to ${dir}:`, err);
      }
    }
  }

  public stop(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    for (const watcher of this.watchers) {
      watcher.close();
    }
    this.watchers = [];
  }
}
