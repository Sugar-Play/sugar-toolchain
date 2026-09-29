import * as vscode from 'vscode';
import * as fs from 'fs';
import * as os from 'os';
import { SugarStateManager } from './state';
import { SugarExecutor } from './executor';

export class SugarDebugger {
  constructor(
    private state: SugarStateManager,
    private executor: SugarExecutor
  ) {}

  public async startDebugging(): Promise<boolean> {
    const root = this.state.getWorkspaceRoot();
    if (!root) {
      vscode.window.showErrorMessage('Sugar++: No workspace folder open');
      return false;
    }

    // 1. Check if profile has debug symbols
    if (this.state.activeProfile === 'release' || this.state.activeProfile === 'minsizerel') {
      const choice = await vscode.window.showWarningMessage(
        `Active profile is '${this.state.activeProfile}', which lacks debug symbols. Switch to 'Debug' for breakpoint support?`,
        'Switch to Debug',
        'Debug Anyway',
        'Cancel'
      );

      if (choice === 'Cancel' || !choice) {
        return false;
      }

      if (choice === 'Switch to Debug') {
        await this.state.setActiveProfile('debug');
      }
    }

    // 2. Build project
    const buildSuccess = await this.executor.build();
    if (!buildSuccess) {
      return false;
    }

    // 3. Locate binary
    const exePath = this.state.getExecutablePath();
    if (!exePath || !fs.existsSync(exePath)) {
      vscode.window.showErrorMessage(`Sugar++: Binary not found at ${exePath}`);
      return false;
    }

    const projectDir = this.state.getActiveProjectDir() || root;
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(projectDir));

    // 4. Create Debug Configuration
    const debugConfig = this.createDebugConfiguration(exePath, projectDir);

    // 5. Start Debugging
    try {
      const started = await vscode.debug.startDebugging(workspaceFolder, debugConfig);
      if (!started) {
        this.promptInstallCppExtension();
      }
      return started;
    } catch {
      this.promptInstallCppExtension();
      return false;
    }
  }

  private createDebugConfiguration(exePath: string, cwd: string): vscode.DebugConfiguration {
    const isWindows = os.platform() === 'win32';
    const isMsvc = this.state.activeCompiler === 'msvc' || (this.state.activeCompiler === 'auto' && isWindows);

    if (isWindows && isMsvc) {
      return {
        name: `Sugar++: Debug (${this.state.activeProfile})`,
        type: 'cppvsdbg',
        request: 'launch',
        program: exePath,
        args: [],
        stopAtEntry: false,
        cwd,
        environment: [],
        console: 'integratedTerminal',
      };
    }

    // GCC / Clang / GDB / LLDB
    const isMac = os.platform() === 'darwin';
    return {
      name: `Sugar++: Debug (${this.state.activeProfile})`,
      type: 'cppdbg',
      request: 'launch',
      program: exePath,
      args: [],
      stopAtEntry: false,
      cwd,
      environment: [],
      externalConsole: false,
      MIMode: isMac ? 'lldb' : 'gdb',
      setupCommands: [
        {
          description: 'Enable pretty-printing for gdb',
          text: '-enable-pretty-printing',
          ignoreFailures: true,
        },
      ],
    };
  }

  private async promptInstallCppExtension(): Promise<void> {
    const installChoice = await vscode.window.showInformationMessage(
      'To enable interactive C++ debugging, the Microsoft C/C++ extension (ms-vscode.cpptools) is recommended.',
      'Install C/C++ Extension',
      'Dismiss'
    );

    if (installChoice === 'Install C/C++ Extension') {
      vscode.commands.executeCommand('workbench.extensions.installExtension', 'ms-vscode.cpptools');
    }
  }
}
