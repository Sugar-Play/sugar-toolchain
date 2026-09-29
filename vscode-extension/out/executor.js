"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.SugarExecutor = void 0;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const child_process_1 = require("child_process");
function stripAnsi(text) {
    return text.replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, '');
}
class SugarExecutor {
    state;
    context;
    outputChannel;
    terminal = null;
    watchProcess = null;
    get isWatching() {
        return this.watchProcess !== null;
    }
    constructor(state, context) {
        this.state = state;
        this.context = context;
        this.outputChannel = vscode.window.createOutputChannel('Sugar++ Build');
    }
    showOutput() {
        this.outputChannel.show(true);
    }
    getCliCommand() {
        const config = vscode.workspace.getConfiguration('sugarpp');
        const customCli = config.get('cliPath', '').trim();
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
    async build(options = {}) {
        const root = this.state.getWorkspaceRoot();
        if (!root) {
            vscode.window.showErrorMessage('Sugar++: No workspace folder open');
            return false;
        }
        const clearOutput = vscode.workspace.getConfiguration('sugarpp').get('clearOutputBeforeBuild', true);
        if (clearOutput) {
            this.outputChannel.clear();
        }
        this.outputChannel.show(true);
        const { command, baseArgs } = this.getCliCommand();
        const args = [...baseArgs, 'build'];
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
        return vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: `Sugar++: Building (${this.state.activeProfile})...`,
            cancellable: true,
        }, (progress, token) => {
            return new Promise((resolve) => {
                const proc = (0, child_process_1.spawn)(command, args, {
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
                    }
                    else {
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
        });
    }
    async clean() {
        const root = this.state.getWorkspaceRoot();
        if (!root)
            return false;
        this.outputChannel.clear();
        this.outputChannel.show(true);
        const { command, baseArgs } = this.getCliCommand();
        const args = [...baseArgs, 'build', '--clean'];
        this.outputChannel.appendLine(`[Sugar++] Cleaning build artifacts...`);
        return new Promise((resolve) => {
            const proc = (0, child_process_1.spawn)(command, args, { cwd: root, shell: false });
            proc.stdout?.on('data', (d) => this.outputChannel.append(stripAnsi(d.toString())));
            proc.stderr?.on('data', (d) => this.outputChannel.append(stripAnsi(d.toString())));
            proc.on('close', (code) => {
                if (code === 0) {
                    vscode.window.showInformationMessage('Sugar++: Build artifacts cleaned.');
                    resolve(true);
                }
                else {
                    vscode.window.showErrorMessage('Sugar++: Failed to clean artifacts.');
                    resolve(false);
                }
            });
        });
    }
    async run() {
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
        const projectDir = this.state.getActiveProjectDir() || this.state.getWorkspaceRoot();
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
    async package() {
        const root = this.state.getWorkspaceRoot();
        if (!root)
            return;
        this.outputChannel.clear();
        this.outputChannel.show(true);
        const { command, baseArgs } = this.getCliCommand();
        const args = [...baseArgs, 'package', '--profile', this.state.activeProfile];
        vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'Sugar++: Packaging distribution bundle...',
        }, () => {
            return new Promise((resolve) => {
                const proc = (0, child_process_1.spawn)(command, args, { cwd: root, shell: false });
                proc.stdout?.on('data', (d) => this.outputChannel.append(stripAnsi(d.toString())));
                proc.stderr?.on('data', (d) => this.outputChannel.append(stripAnsi(d.toString())));
                proc.on('close', (code) => {
                    if (code === 0) {
                        vscode.window.showInformationMessage('Sugar++: Package created successfully in dist/');
                    }
                    else {
                        vscode.window.showErrorMessage('Sugar++: Packaging failed.');
                    }
                    resolve();
                });
            });
        });
    }
    toggleWatch(onStatusChange) {
        if (this.watchProcess) {
            this.watchProcess.kill();
            this.watchProcess = null;
            onStatusChange(false);
            vscode.window.showInformationMessage('Sugar++: Watch mode stopped.');
            return;
        }
        const root = this.state.getWorkspaceRoot();
        if (!root)
            return;
        const { command, baseArgs } = this.getCliCommand();
        const args = [...baseArgs, 'watch', '--profile', this.state.activeProfile, '--run'];
        this.outputChannel.show(true);
        this.outputChannel.appendLine(`[Sugar++] Starting watch mode...\n`);
        this.watchProcess = (0, child_process_1.spawn)(command, args, {
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
    dispose() {
        this.outputChannel.dispose();
        if (this.watchProcess) {
            this.watchProcess.kill();
        }
        if (this.terminal) {
            this.terminal.dispose();
        }
    }
}
exports.SugarExecutor = SugarExecutor;
//# sourceMappingURL=executor.js.map