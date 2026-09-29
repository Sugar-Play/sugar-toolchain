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
exports.SugarDebugger = void 0;
const vscode = __importStar(require("vscode"));
const fs = __importStar(require("fs"));
const os = __importStar(require("os"));
class SugarDebugger {
    state;
    executor;
    constructor(state, executor) {
        this.state = state;
        this.executor = executor;
    }
    async startDebugging() {
        const root = this.state.getWorkspaceRoot();
        if (!root) {
            vscode.window.showErrorMessage('Sugar++: No workspace folder open');
            return false;
        }
        // 1. Check if profile has debug symbols
        if (this.state.activeProfile === 'release' || this.state.activeProfile === 'minsizerel') {
            const choice = await vscode.window.showWarningMessage(`Active profile is '${this.state.activeProfile}', which lacks debug symbols. Switch to 'Debug' for breakpoint support?`, 'Switch to Debug', 'Debug Anyway', 'Cancel');
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
        }
        catch {
            this.promptInstallCppExtension();
            return false;
        }
    }
    createDebugConfiguration(exePath, cwd) {
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
    async promptInstallCppExtension() {
        const installChoice = await vscode.window.showInformationMessage('To enable interactive C++ debugging, the Microsoft C/C++ extension (ms-vscode.cpptools) is recommended.', 'Install C/C++ Extension', 'Dismiss');
        if (installChoice === 'Install C/C++ Extension') {
            vscode.commands.executeCommand('workbench.extensions.installExtension', 'ms-vscode.cpptools');
        }
    }
}
exports.SugarDebugger = SugarDebugger;
//# sourceMappingURL=debugger.js.map