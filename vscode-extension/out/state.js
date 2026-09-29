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
exports.SugarStateManager = void 0;
const vscode = __importStar(require("vscode"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
class SugarStateManager {
    context;
    _onDidChangeState = new vscode.EventEmitter();
    onDidChangeState = this._onDidChangeState.event;
    _activeProfile = 'release';
    _activeCompiler = 'auto';
    _activeProjectName;
    _projectConfig = null;
    _workspaceInfo = null;
    constructor(context) {
        this.context = context;
        this.loadState();
        this.refresh();
    }
    get activeProfile() {
        return this._activeProfile;
    }
    async setActiveProfile(profile) {
        this._activeProfile = profile;
        await this.context.workspaceState.update('sugarpp.activeProfile', profile);
        this._onDidChangeState.fire();
    }
    get activeCompiler() {
        return this._activeCompiler;
    }
    async setActiveCompiler(compiler) {
        this._activeCompiler = compiler;
        await this.context.workspaceState.update('sugarpp.activeCompiler', compiler);
        this._onDidChangeState.fire();
    }
    get activeProjectName() {
        return this._activeProjectName;
    }
    async setActiveProjectName(name) {
        this._activeProjectName = name;
        await this.context.workspaceState.update('sugarpp.activeProjectName', name);
        this._onDidChangeState.fire();
    }
    get projectConfig() {
        return this._projectConfig;
    }
    get workspaceInfo() {
        return this._workspaceInfo;
    }
    get hasProject() {
        return this._projectConfig !== null || this._workspaceInfo !== null;
    }
    getWorkspaceRoot() {
        const folders = vscode.workspace.workspaceFolders;
        if (!folders || folders.length === 0) {
            return undefined;
        }
        return folders[0].uri.fsPath;
    }
    getActiveProjectDir() {
        const root = this.getWorkspaceRoot();
        if (!root)
            return undefined;
        if (this._workspaceInfo && this._activeProjectName) {
            const proj = this._workspaceInfo.projects.find((p) => p.name === this._activeProjectName);
            if (proj)
                return proj.dir;
        }
        return root;
    }
    getExecutablePath() {
        const root = this.getActiveProjectDir();
        if (!root)
            return undefined;
        const config = this.getActiveConfig();
        const out = config?.output || 'target/bin/app.exe';
        if (path.isAbsolute(out)) {
            return out;
        }
        return path.join(root, out);
    }
    getActiveConfig() {
        if (this._workspaceInfo && this._activeProjectName) {
            const proj = this._workspaceInfo.projects.find((p) => p.name === this._activeProjectName);
            if (proj)
                return proj.config;
        }
        return this._projectConfig;
    }
    refresh() {
        const root = this.getWorkspaceRoot();
        if (!root) {
            this._projectConfig = null;
            this._workspaceInfo = null;
            vscode.commands.executeCommand('setContext', 'sugarpp:hasProject', false);
            this._onDidChangeState.fire();
            return;
        }
        // Check cpp.json
        const cppJsonPath = path.join(root, 'cpp.json');
        if (fs.existsSync(cppJsonPath)) {
            try {
                const raw = fs.readFileSync(cppJsonPath, 'utf8');
                this._projectConfig = JSON.parse(raw);
            }
            catch {
                this._projectConfig = null;
            }
        }
        else {
            this._projectConfig = null;
        }
        // Check workspace.json
        const wsJsonPath = path.join(root, 'workspace.json');
        if (fs.existsSync(wsJsonPath)) {
            try {
                const raw = fs.readFileSync(wsJsonPath, 'utf8');
                const parsed = JSON.parse(raw);
                this.discoverWorkspaceProjects(root, parsed);
            }
            catch {
                this._workspaceInfo = null;
            }
        }
        else {
            this._workspaceInfo = null;
        }
        const hasProj = this.hasProject;
        vscode.commands.executeCommand('setContext', 'sugarpp:hasProject', hasProj);
        this._onDidChangeState.fire();
    }
    discoverWorkspaceProjects(rootDir, wsConfig) {
        const projects = [];
        // If root also has cpp.json, include it
        if (this._projectConfig) {
            projects.push({
                name: this._projectConfig.name || 'root',
                dir: rootDir,
                relDir: '.',
                config: this._projectConfig,
                isRoot: true,
            });
        }
        const patterns = wsConfig.projects || [];
        for (const pattern of patterns) {
            const cleanPattern = pattern.replace(/\/\*$/, '');
            const searchDir = path.join(rootDir, cleanPattern);
            if (fs.existsSync(searchDir)) {
                try {
                    const entries = fs.readdirSync(searchDir, { withFileTypes: true });
                    for (const entry of entries) {
                        if (entry.isDirectory()) {
                            const subDir = path.join(searchDir, entry.name);
                            const subConfigPath = path.join(subDir, 'cpp.json');
                            if (fs.existsSync(subConfigPath)) {
                                try {
                                    const cfgRaw = fs.readFileSync(subConfigPath, 'utf8');
                                    const cfg = JSON.parse(cfgRaw);
                                    projects.push({
                                        name: cfg.name || entry.name,
                                        dir: subDir,
                                        relDir: path.relative(rootDir, subDir),
                                        config: cfg,
                                        isRoot: false,
                                    });
                                }
                                catch {
                                    // ignore invalid json
                                }
                            }
                        }
                    }
                }
                catch {
                    // ignore read error
                }
            }
        }
        this._workspaceInfo = {
            name: wsConfig.name || path.basename(rootDir),
            rootDir,
            projects,
        };
        if (!this._activeProjectName && projects.length > 0) {
            this._activeProjectName = projects[0].name;
        }
    }
    loadState() {
        const savedProfile = this.context.workspaceState.get('sugarpp.activeProfile');
        if (savedProfile) {
            this._activeProfile = savedProfile;
        }
        else {
            const defaultProfile = vscode.workspace.getConfiguration('sugarpp').get('defaultProfile', 'release');
            this._activeProfile = defaultProfile;
        }
        const savedCompiler = this.context.workspaceState.get('sugarpp.activeCompiler');
        if (savedCompiler) {
            this._activeCompiler = savedCompiler;
        }
        else {
            const defaultCompiler = vscode.workspace.getConfiguration('sugarpp').get('defaultCompiler', 'auto');
            this._activeCompiler = defaultCompiler;
        }
        this._activeProjectName = this.context.workspaceState.get('sugarpp.activeProjectName');
    }
}
exports.SugarStateManager = SugarStateManager;
//# sourceMappingURL=state.js.map