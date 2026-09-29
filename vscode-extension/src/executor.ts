import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { spawn, ChildProcess } from 'child_process';
import { SugarStateManager } from './state';

function stripAnsi(text: string): string {
  return text.replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, '');
}

export class SugarExecutor implements vscode.Disposable {
  private outputChannel: vscode.OutputChannel;
  private terminal: vscode.Terminal | null = null;
  private watchProcess: ChildProcess | null = null;

  public get isWatching(): boolean {
    return this.watchProcess !== null;
  }

  constructor(
    private state: SugarStateManager,
    private context?: vscode.ExtensionContext
  ) {
    this.outputChannel = vscode.window.createOutputChannel('Sugar++ Build');
  }

  public showOutput(): void {
    this.outputChannel.show(true);
  }

  public getCliCommand(): { command: string; baseArgs: string[] } {
    const config = vscode.workspace.getConfiguration('sugarpp');
    const customCli = config.get<string>('cliPath', '').trim();

    if (customCli) {
      if (customCli.endsWith('.js') || customCli.endsWith('.ts') || customCli.endsWith('.cjs')) {
        return { command: 'node', baseArgs: [customCli] };
      }
      return { command: customCli, baseArgs: [] };
    }

    // 1. Bundled Sugar++ build engine inside extension
    if (this.context) {
      const bundledScript = path.join(this.context.extensionPath, 'bundled', 'sugar.cjs');
      if (fs.existsSync(bundledScript)) {
        return { command: 'node', baseArgs: [bundledScript] };
      }
    }

    // 2. Workspace local script/sugar.js
    const root = this.state.getWorkspaceRoot();
    if (root) {
      const localScript = path.join(root, 'script', 'sugar.js');
      if (fs.existsSync(localScript)) {
        return { command: 'node', baseArgs: [localScript] };
      }
    }

    // 3. Default to global spp CLI
    return { command: 'spp', baseArgs: [] };
  }

  public async build(options: { clean?: boolean; rebuild?: boolean } = {}): Promise<boolean> {
    const root = this.state.getWorkspaceRoot();
    if (!root) {
      vscode.window.showErrorMessage('Sugar++: No workspace folder open');
      return false;
    }

    const clearOutput = vscode.workspace.getConfiguration('sugarpp').get<boolean>('clearOutputBeforeBuild', true);
    if (clearOutput) {
      this.outputChannel.clear();
    }
    this.outputChannel.show(true);

    const { command, baseArgs } = this.getCliCommand();
    const args: string[] = [...baseArgs, 'build'];

    // Add profile
    args.push('--profile', this.state.activeProfile);

    // Add compiler
    if (this.state.activeCompiler !== 'auto') {
      args.push('--compiler', this.state.activeCompiler);
    }

    // Add target project if workspace
    if (this.state.workspaceInfo && this.state.activeProjectName && this.state.activeProjectName !== 'all') {
      args.push('--project', this.state.activeProjectName);
    }

    if (options.clean || options.rebuild) {
      args.push('--clean');
    }

    this.outputChannel.appendLine(`[Sugar++] Running: ${command} ${args.join(' ')}`);
    this.outputChannel.appendLine(`[Sugar++] Working Directory: ${root}\n`);

    return vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `Sugar++: Building (${this.state.activeProfile})...`,
        cancellable: true,
      },
      (progress, token) => {
        return new Promise<boolean>((resolve) => {
          const proc = spawn(command, args, {
            cwd: root,
            shell: false,
          });

          token.onCancellationRequested(() => {
            proc.kill();
            this.outputChannel.appendLine('\n[Sugar++] Build cancelled by user.');
            resolve(false);
          });

          proc.stdout?.on('data', (data) => {
            this.outputChannel.append(stripAnsi(data.toString()));
          });

          proc.stderr?.on('data', (data) => {
            this.outputChannel.append(stripAnsi(data.toString()));
          });

          proc.on('close', (code) => {
            if (code === 0) {
              this.outputChannel.appendLine(`\n[Sugar++] Build completed successfully.`);
              vscode.window.setStatusBarMessage(`$(check) Sugar++: Build succeeded`, 3000);
              resolve(true);
            } else {
              this.outputChannel.appendLine(`\n[Sugar++] Build failed with exit code ${code}.`);
              vscode.window.showErrorMessage(`Sugar++: Build failed (code ${code}). Check Output for details.`);
              resolve(false);
            }
          });

          proc.on('error', (err) => {
            this.outputChannel.appendLine(`\n[Sugar++] Execution error: ${err.message}`);
            vscode.window.showErrorMessage(`Sugar++: Execution error: ${err.message}`);
            resolve(false);
          });
        });
      }
    );
  }

  public async clean(): Promise<boolean> {
    const root = this.state.getWorkspaceRoot();
    if (!root) return false;

    this.outputChannel.clear();
    this.outputChannel.show(true);

    const { command, baseArgs } = this.getCliCommand();
    const args = [...baseArgs, 'build', '--clean'];

    this.outputChannel.appendLine(`[Sugar++] Cleaning build artifacts...`);

    return new Promise<boolean>((resolve) => {
      const proc = spawn(command, args, { cwd: root, shell: false });
      proc.stdout?.on('data', (d) => this.outputChannel.append(stripAnsi(d.toString())));
      proc.stderr?.on('data', (d) => this.outputChannel.append(stripAnsi(d.toString())));
      proc.on('close', (code) => {
        if (code === 0) {
          vscode.window.showInformationMessage('Sugar++: Build artifacts cleaned.');
          resolve(true);
        } else {
          vscode.window.showErrorMessage('Sugar++: Failed to clean artifacts.');
          resolve(false);
        }
      });
    });
  }

  public async run(): Promise<void> {
    // 1. Build first to ensure executable is up to date
    const buildOk = await this.build();
    if (!buildOk) {
      return;
    }

    const exePath = this.state.getExecutablePath();
    if (!exePath || !fs.existsSync(exePath)) {
      vscode.window.showErrorMessage(`Sugar++: Executable not found at ${exePath}`);
      return;
    }

    const projectDir = this.state.getActiveProjectDir() || this.state.getWorkspaceRoot()!;

    // Run in integrated terminal
    if (!this.terminal || this.terminal.exitStatus !== undefined) {
      this.terminal = vscode.window.createTerminal({
        name: 'Sugar++ Run',
        cwd: projectDir,
      });
    }

    this.terminal.show();
    const rel = path.relative(projectDir, exePath);
    const runCmd = rel.startsWith('.') ? rel : `.${path.sep}${rel}`;
    this.terminal.sendText(runCmd);
  }

  public async package(): Promise<void> {
    const root = this.state.getWorkspaceRoot();
    if (!root) return;

    this.outputChannel.clear();
    this.outputChannel.show(true);

    const { command, baseArgs } = this.getCliCommand();
    const args = [...baseArgs, 'package', '--profile', this.state.activeProfile];

    vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Sugar++: Packaging distribution bundle...',
      },
      () => {
        return new Promise<void>((resolve) => {
          const proc = spawn(command, args, { cwd: root, shell: false });
          proc.stdout?.on('data', (d) => this.outputChannel.append(stripAnsi(d.toString())));
          proc.stderr?.on('data', (d) => this.outputChannel.append(stripAnsi(d.toString())));
          proc.on('close', (code) => {
            if (code === 0) {
              vscode.window.showInformationMessage('Sugar++: Package created successfully in dist/');
            } else {
              vscode.window.showErrorMessage('Sugar++: Packaging failed.');
            }
            resolve();
          });
        });
      }
    );
  }

  public toggleWatch(onStatusChange: (isWatching: boolean) => void): void {
    if (this.watchProcess) {
      this.watchProcess.kill();
      this.watchProcess = null;
      onStatusChange(false);
      vscode.window.showInformationMessage('Sugar++: Watch mode stopped.');
      return;
    }

    const root = this.state.getWorkspaceRoot();
    if (!root) return;

    const { command, baseArgs } = this.getCliCommand();
    const args = [...baseArgs, 'watch', '--profile', this.state.activeProfile, '--run'];

    this.outputChannel.show(true);
    this.outputChannel.appendLine(`[Sugar++] Starting watch mode...\n`);

    this.watchProcess = spawn(command, args, {
      cwd: root,
      shell: false,
    });

    onStatusChange(true);
    vscode.window.showInformationMessage('Sugar++: Watch mode started (auto recompile & run on save).');

    this.watchProcess.stdout?.on('data', (d) => this.outputChannel.append(stripAnsi(d.toString())));
    this.watchProcess.stderr?.on('data', (d) => this.outputChannel.append(stripAnsi(d.toString())));

    this.watchProcess.on('close', () => {
      this.watchProcess = null;
      onStatusChange(false);
      this.outputChannel.appendLine(`\n[Sugar++] Watch mode process stopped.`);
    });
  }

  public dispose(): void {
    this.outputChannel.dispose();
    if (this.watchProcess) {
      this.watchProcess.kill();
    }
    if (this.terminal) {
      this.terminal.dispose();
    }
  }
}
