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
exports.SugarStatusBarManager = void 0;
const vscode = __importStar(require("vscode"));
class SugarStatusBarManager {
    state;
    configItem;
    compilerItem;
    buildItem;
    runItem;
    debugItem;
    constructor(state) {
        this.state = state;
        // 1. Solution Configuration Dropdown: [ Release $(chevron-down) ]
        this.configItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
        this.configItem.command = 'sugarpp.selectProfile';
        // 2. Solution Platform / Compiler Dropdown: [ MSVC $(chevron-down) ]
        this.compilerItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 95);
        this.compilerItem.command = 'sugarpp.selectCompiler';
        // 3. Build Solution Button: [ $(gear) Build ]
        this.buildItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 90);
        this.buildItem.command = 'sugarpp.build';
        this.buildItem.text = '$(gear) Build';
        this.buildItem.tooltip = 'Build Solution (Ctrl+Shift+B)';
        // 4. Start (Without Debugging): [ $(play) app ]
        this.runItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 85);
        this.runItem.command = 'sugarpp.run';
        this.runItem.tooltip = 'Start Without Debugging (Ctrl+F5)';
        // 5. Start Debugging: [ $(bug) Debug ]
        this.debugItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 80);
        this.debugItem.command = 'sugarpp.debug';
        this.debugItem.text = '$(bug) Debug';
        this.debugItem.tooltip = 'Start Debugging (F5)';
        this.update();
        state.onDidChangeState(() => this.update());
    }
    setWatching(_watching) {
        this.update();
    }
    update() {
        const config = vscode.workspace.getConfiguration('sugarpp');
        const enabled = config.get('showStatusBar', true);
        if (!enabled || !this.state.hasProject) {
            this.hideAll();
            return;
        }
        // 1. Visual Studio Solution Configuration (with interactive bottom popup dropdown)
        const profile = this.formatProfile(this.state.activeProfile);
        this.configItem.text = `${profile} $(chevron-down)`;
        const mdConfig = new vscode.MarkdownString('', true);
        mdConfig.isTrusted = true;
        mdConfig.supportHtml = true;
        mdConfig.appendMarkdown(`### Sugar++ Solution Configuration\n\n`);
        const profiles = [
            { id: 'debug', label: 'Debug', desc: '-O0 -g (debug symbols)' },
            { id: 'release', label: 'Release', desc: '-O2 (optimized for speed)' },
            { id: 'relwithdebinfo', label: 'RelWithDebInfo', desc: '-O2 -g (debug + opt)' },
            { id: 'minsizerel', label: 'MinSizeRel', desc: '-Os (minimum size)' },
        ];
        for (const p of profiles) {
            const isSelected = p.id === this.state.activeProfile;
            const prefix = isSelected ? '**✓ ' : '&nbsp;&nbsp;&nbsp;&nbsp;';
            const suffix = isSelected ? '**' : '';
            const cmd = `command:sugarpp.setProfileDirect?${encodeURIComponent(JSON.stringify(p.id))}`;
            mdConfig.appendMarkdown(`${prefix}[${p.label}](${cmd})${suffix} &mdash; *${p.desc}*\n\n`);
        }
        mdConfig.appendMarkdown(`---\n\n`);
        mdConfig.appendMarkdown(`[$(gear) **Build**](command:sugarpp.build) &nbsp;&nbsp;|&nbsp;&nbsp; ` +
            `[$(play) **Run**](command:sugarpp.run) &nbsp;&nbsp;|&nbsp;&nbsp; ` +
            `[$(bug) **Debug**](command:sugarpp.debug) &nbsp;&nbsp;|&nbsp;&nbsp; ` +
            `[$(trash) **Clean**](command:sugarpp.clean)\n`);
        this.configItem.tooltip = mdConfig;
        this.configItem.show();
        // 2. Visual Studio Solution Platform / Compiler Dropdown
        const compiler = this.state.activeCompiler.toUpperCase();
        this.compilerItem.text = `${compiler} $(chevron-down)`;
        const mdComp = new vscode.MarkdownString('', true);
        mdComp.isTrusted = true;
        mdComp.supportHtml = true;
        mdComp.appendMarkdown(`### Solution Platform / Compiler\n\n`);
        const compilers = [
            { id: 'auto', label: 'Auto', desc: 'Auto-detect compiler' },
            { id: 'msvc', label: 'MSVC', desc: 'Microsoft Visual C++ (cl.exe)' },
            { id: 'gcc', label: 'GCC', desc: 'GNU Compiler Collection (g++)' },
            { id: 'clang', label: 'Clang', desc: 'LLVM Clang (clang++)' },
        ];
        for (const c of compilers) {
            const isSelected = c.id === this.state.activeCompiler;
            const prefix = isSelected ? '**✓ ' : '&nbsp;&nbsp;&nbsp;&nbsp;';
            const suffix = isSelected ? '**' : '';
            const cmd = `command:sugarpp.setCompilerDirect?${encodeURIComponent(JSON.stringify(c.id))}`;
            mdComp.appendMarkdown(`${prefix}[${c.label}](${cmd})${suffix} &mdash; *${c.desc}*\n\n`);
        }
        this.compilerItem.tooltip = mdComp;
        this.compilerItem.show();
        // 3. Build button
        this.buildItem.show();
        // 4. Run Target: [ ▶ Run ]
        const targetName = this.state.projectConfig?.name || 'app';
        this.runItem.text = '$(play) Run';
        this.runItem.tooltip = `Start Without Debugging (${targetName}.exe) - Ctrl+F5`;
        this.runItem.show();
        // 5. Debug target
        this.debugItem.show();
    }
    hideAll() {
        this.configItem.hide();
        this.compilerItem.hide();
        this.buildItem.hide();
        this.runItem.hide();
        this.debugItem.hide();
    }
    formatProfile(profile) {
        switch (profile.toLowerCase()) {
            case 'release':
                return 'Release';
            case 'debug':
                return 'Debug';
            case 'relwithdebinfo':
                return 'RelWithDebInfo';
            case 'minsizerel':
                return 'MinSizeRel';
            default:
                return profile;
        }
    }
    dispose() {
        this.configItem.dispose();
        this.compilerItem.dispose();
        this.buildItem.dispose();
        this.runItem.dispose();
        this.debugItem.dispose();
    }
}
exports.SugarStatusBarManager = SugarStatusBarManager;
//# sourceMappingURL=statusBar.js.map