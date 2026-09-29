import { spawn, type ChildProcess } from 'node:child_process';
import * as path from 'node:path';
import * as fs from 'node:fs';
import type { RunOptions, RunResult } from './types.js';

let activeProcess: ChildProcess | null = null;

// Ensure child process is killed if CLI receives termination
process.on('SIGINT', () => {
  if (activeProcess && !activeProcess.killed) {
    activeProcess.kill('SIGINT');
  }
});

export function runExecutable(
  executablePath: string,
  options: RunOptions = {}
): Promise<RunResult> {
  return new Promise((resolve) => {
    if (!fs.existsSync(executablePath)) {
      resolve({
        exitCode: 1,
        signal: null,
        durationMs: 0,
        error: new Error(`Executable not found at path: ${executablePath}`),
      });
      return;
    }

    const startTime = Date.now();
    const cwd = options.cwd || path.dirname(executablePath);
    const args = options.args || [];

    const env: NodeJS.ProcessEnv = { ...process.env, ...(options.env || {}) };
    if (options.vendorBinDirs && options.vendorBinDirs.length > 0) {
      const currentPath = env['PATH'] || env['Path'] || '';
      const prepend = options.vendorBinDirs.join(path.delimiter);
      env['PATH'] = `${prepend}${path.delimiter}${currentPath}`;
      env['Path'] = env['PATH'];
    }

    const child = spawn(executablePath, args, {
      cwd,
      stdio: options.interactive === false ? ['pipe', 'pipe', 'pipe'] : 'inherit',
      env,
      windowsHide: false,
    });

    activeProcess = child;

    let timeoutTimer: NodeJS.Timeout | undefined;
    if (options.timeout && options.timeout > 0) {
      timeoutTimer = setTimeout(() => {
        child.kill('SIGTERM');
      }, options.timeout);
    }

    child.on('error', (err) => {
      if (timeoutTimer) clearTimeout(timeoutTimer);
      activeProcess = null;
      resolve({
        exitCode: 1,
        signal: null,
        durationMs: Date.now() - startTime,
        error: err,
      });
    });

    child.on('close', (exitCode, signal) => {
      if (timeoutTimer) clearTimeout(timeoutTimer);
      activeProcess = null;
      resolve({
        exitCode,
        signal: signal ? String(signal) : null,
        durationMs: Date.now() - startTime,
      });
    });
  });
}
