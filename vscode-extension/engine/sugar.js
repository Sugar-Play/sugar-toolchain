#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const tsxCli = path.resolve(__dirname, '../node_modules/tsx/dist/cli.mjs');
const scriptPath = path.resolve(__dirname, 'sugar.ts');

const child = spawn(
  process.execPath,
  [tsxCli, scriptPath, ...process.argv.slice(2)],
  {
    stdio: 'inherit',
    windowsHide: true,
  }
);

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
  } else {
    process.exit(code ?? 0);
  }
});
