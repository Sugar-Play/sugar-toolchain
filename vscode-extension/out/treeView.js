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
exports.SugarProjectTreeDataProvider = exports.SugarProjectTreeItem = void 0;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
class SugarProjectTreeItem extends vscode.TreeItem {
    label;
    collapsibleState;
    contextValue;
    command;
    description;
    iconPath;
    constructor(label, collapsibleState, contextValue, command, description, iconPath) {
        super(label, collapsibleState);
        this.label = label;
        this.collapsibleState = collapsibleState;
        this.contextValue = contextValue;
        this.command = command;
        this.description = description;
        this.iconPath = iconPath;
        if (description)
            this.description = description;
        if (iconPath)
            this.iconPath = iconPath;
        if (command)
            this.command = command;
    }
}
exports.SugarProjectTreeItem = SugarProjectTreeItem;
class SugarProjectTreeDataProvider {
    state;
    _onDidChangeTreeData = new vscode.EventEmitter();
    onDidChangeTreeData = this._onDidChangeTreeData.event;
    constructor(state) {
        this.state = state;
        this.state.onDidChangeState(() => this.refresh());
    }
    refresh() {
        this._onDidChangeTreeData.fire();
    }
    getTreeItem(element) {
        return element;
    }
    async getChildren(element) {
        const root = this.state.getWorkspaceRoot();
        if (!root || !this.state.hasProject) {
            return [
                new SugarProjectTreeItem('No Sugar++ project detected', vscode.TreeItemCollapsibleState.None, 'empty', { command: 'sugarpp.init', title: 'Initialize cpp.json' }, 'Click to initialize'),
            ];
        }
        const activeConfig = this.state.getActiveConfig();
        const projName = activeConfig?.name || this.state.activeProjectName || 'app';
        const targetType = activeConfig?.type || 'exe';
        if (!element) {
            // Top-level Visual Studio Solution Explorer project root
            const typeLabel = this.formatTargetType(targetType);
            const rootItem = new SugarProjectTreeItem(projName, vscode.TreeItemCollapsibleState.Expanded, 'solutionProject', undefined, `(${typeLabel})`, this.getTargetTypeIcon(targetType));
            return [rootItem];
        }
        // Children of Solution Project Root: Visual Studio Filters / Groups
        if (element.contextValue === 'solutionProject') {
            const items = [];
            // 1. Source Files Filter (*.cpp, *.c)
            items.push(new SugarProjectTreeItem('Source Files', vscode.TreeItemCollapsibleState.Expanded, 'sourceFilesFilter', undefined, undefined, new vscode.ThemeIcon('folder')));
            // 2. Header Files Filter (*.h, *.hpp)
            items.push(new SugarProjectTreeItem('Header Files', vscode.TreeItemCollapsibleState.Expanded, 'headerFilesFilter', undefined, undefined, new vscode.ThemeIcon('folder')));
            // 3. References & Libraries
            items.push(new SugarProjectTreeItem('References & Libraries', vscode.TreeItemCollapsibleState.Collapsed, 'referencesFilter', undefined, undefined, new vscode.ThemeIcon('references')));
            // 4. Build Outputs (target/)
            items.push(new SugarProjectTreeItem('Build Outputs', vscode.TreeItemCollapsibleState.Collapsed, 'outputsFilter', undefined, 'target/', new vscode.ThemeIcon('output')));
            // 5. Project Properties
            items.push(new SugarProjectTreeItem('Properties', vscode.TreeItemCollapsibleState.Collapsed, 'propertiesFilter', undefined, undefined, new vscode.ThemeIcon('settings-gear')));
            return items;
        }
        // --- 1. SOURCE FILES FILTER ---
        if (element.contextValue === 'sourceFilesFilter') {
            const items = [];
            const srcDir = path.join(root, activeConfig?.srcDir || 'src');
            if (fs.existsSync(srcDir)) {
                const files = this.scanFiles(srcDir, ['.cpp', '.cxx', '.cc', '.c']);
                for (const file of files) {
                    items.push(new SugarProjectTreeItem(file.relPath, vscode.TreeItemCollapsibleState.None, 'sourceFile', {
                        command: 'vscode.open',
                        title: 'Open File',
                        arguments: [vscode.Uri.file(file.fullPath)],
                    }, file.ext, new vscode.ThemeIcon('file-code')));
                }
            }
            // Add New Source File action
            items.push(new SugarProjectTreeItem('+ Add Source File (.cpp)...', vscode.TreeItemCollapsibleState.None, 'addItem', { command: 'sugarpp.addSourceFile', title: 'Add Source File' }, undefined, new vscode.ThemeIcon('add')));
            return items;
        }
        // --- 2. HEADER FILES FILTER ---
        if (element.contextValue === 'headerFilesFilter') {
            const items = [];
            const searchDirs = [
                path.join(root, activeConfig?.srcDir || 'src'),
                path.join(root, 'include'),
            ];
            for (const sDir of searchDirs) {
                if (fs.existsSync(sDir)) {
                    const files = this.scanFiles(sDir, ['.hpp', '.h', '.hxx', '.inl']);
                    for (const file of files) {
                        items.push(new SugarProjectTreeItem(file.relPath, vscode.TreeItemCollapsibleState.None, 'headerFile', {
                            command: 'vscode.open',
                            title: 'Open File',
                            arguments: [vscode.Uri.file(file.fullPath)],
                        }, file.ext, new vscode.ThemeIcon('symbol-interface')));
                    }
                }
            }
            // Add New Header File action
            items.push(new SugarProjectTreeItem('+ Add Header File (.hpp)...', vscode.TreeItemCollapsibleState.None, 'addItem', { command: 'sugarpp.addHeaderFile', title: 'Add Header File' }, undefined, new vscode.ThemeIcon('add')));
            // Add Class (Header + Source)
            items.push(new SugarProjectTreeItem('+ Add New C++ Class...', vscode.TreeItemCollapsibleState.None, 'addItem', { command: 'sugarpp.addClass', title: 'Add Class' }, undefined, new vscode.ThemeIcon('symbol-class')));
            return items;
        }
        // --- 3. REFERENCES & LIBRARIES ---
        if (element.contextValue === 'referencesFilter') {
            const items = [];
            const vendorDir = path.join(root, activeConfig?.vendorDir || 'vendor');
            if (fs.existsSync(vendorDir)) {
                try {
                    const entries = fs.readdirSync(vendorDir, { withFileTypes: true });
                    for (const entry of entries) {
                        if (entry.isDirectory()) {
                            const vPath = path.join(vendorDir, entry.name);
                            const info = this.inspectVendorLib(vPath);
                            items.push(new SugarProjectTreeItem(entry.name, vscode.TreeItemCollapsibleState.None, 'vendorLib', undefined, `(${info.type})`, new vscode.ThemeIcon(info.icon)));
                        }
                    }
                }
                catch {
                    // ignore
                }
            }
            // Linked System Libraries (libs from cpp.json)
            const libs = activeConfig?.libs || [];
            for (const lib of libs) {
                items.push(new SugarProjectTreeItem(lib, vscode.TreeItemCollapsibleState.None, 'sysLib', undefined, '(system lib)', new vscode.ThemeIcon('library')));
            }
            return items;
        }
        // --- 4. BUILD OUTPUTS ---
        if (element.contextValue === 'outputsFilter') {
            const items = [];
            const targetDir = path.join(root, activeConfig?.targetDir || 'target');
            if (fs.existsSync(targetDir)) {
                const binDir = path.join(targetDir, 'bin');
                if (fs.existsSync(binDir)) {
                    const binFiles = fs.readdirSync(binDir);
                    for (const bf of binFiles) {
                        const fullP = path.join(binDir, bf);
                        const stat = fs.statSync(fullP);
                        const sizeKb = (stat.size / 1024).toFixed(1) + ' KB';
                        items.push(new SugarProjectTreeItem(bf, vscode.TreeItemCollapsibleState.None, 'artifact', {
                            command: 'revealFileInOS',
                            title: 'Show in Explorer',
                            arguments: [vscode.Uri.file(fullP)],
                        }, sizeKb, this.getFileIcon(bf)));
                    }
                }
                const libDir = path.join(targetDir, 'lib');
                if (fs.existsSync(libDir)) {
                    const libFiles = fs.readdirSync(libDir);
                    for (const lf of libFiles) {
                        const fullP = path.join(libDir, lf);
                        const stat = fs.statSync(fullP);
                        const sizeKb = (stat.size / 1024).toFixed(1) + ' KB';
                        items.push(new SugarProjectTreeItem(lf, vscode.TreeItemCollapsibleState.None, 'artifact', {
                            command: 'revealFileInOS',
                            title: 'Show in Explorer',
                            arguments: [vscode.Uri.file(fullP)],
                        }, sizeKb, new vscode.ThemeIcon('archive')));
                    }
                }
            }
            if (items.length === 0) {
                items.push(new SugarProjectTreeItem('No build outputs yet', vscode.TreeItemCollapsibleState.None, 'info', { command: 'sugarpp.build', title: 'Build Project' }, 'Click to build'));
            }
            return items;
        }
        // --- 5. PROPERTIES ---
        if (element.contextValue === 'propertiesFilter') {
            const cfg = this.state.getActiveConfig();
            const currentType = cfg?.type || 'exe';
            return [
                new SugarProjectTreeItem(`Target Type: ${this.formatTargetType(currentType)}`, vscode.TreeItemCollapsibleState.None, 'propertyAction', { command: 'sugarpp.selectTargetType', title: 'Change Target Type' }, 'Click to change', new vscode.ThemeIcon('symbol-structure')),
                new SugarProjectTreeItem(`Configuration: ${this.state.activeProfile.toUpperCase()}`, vscode.TreeItemCollapsibleState.None, 'propertyAction', { command: 'sugarpp.selectProfile', title: 'Change Profile' }, 'Click to change', new vscode.ThemeIcon('gear')),
                new SugarProjectTreeItem(`Compiler: ${this.state.activeCompiler.toUpperCase()}`, vscode.TreeItemCollapsibleState.None, 'propertyAction', { command: 'sugarpp.selectCompiler', title: 'Change Compiler' }, 'Click to change', new vscode.ThemeIcon('tools')),
                new SugarProjectTreeItem(`C++ Standard: ${cfg?.std || 'c++20'}`, vscode.TreeItemCollapsibleState.None, 'info', undefined, undefined, new vscode.ThemeIcon('tag')),
                new SugarProjectTreeItem(`Optimization: ${cfg?.optimization || 'O2'}`, vscode.TreeItemCollapsibleState.None, 'info', undefined, undefined, new vscode.ThemeIcon('zap')),
            ];
        }
        return [];
    }
    scanFiles(dir, extensions) {
        const results = [];
        const walk = (currentDir, baseDir) => {
            try {
                const entries = fs.readdirSync(currentDir, { withFileTypes: true });
                for (const entry of entries) {
                    const fullPath = path.join(currentDir, entry.name);
                    if (entry.isDirectory()) {
                        walk(fullPath, baseDir);
                    }
                    else if (entry.isFile()) {
                        const ext = path.extname(entry.name).toLowerCase();
                        if (extensions.includes(ext)) {
                            results.push({
                                relPath: path.relative(baseDir, fullPath).replace(/\\/g, '/'),
                                fullPath,
                                ext,
                            });
                        }
                    }
                }
            }
            catch {
                // ignore read error
            }
        };
        walk(dir, dir);
        return results;
    }
    inspectVendorLib(vendorPath) {
        const hasInclude = fs.existsSync(path.join(vendorPath, 'include'));
        const hasLib = fs.existsSync(path.join(vendorPath, 'lib'));
        const hasBin = fs.existsSync(path.join(vendorPath, 'bin'));
        if (hasBin) {
            return { type: 'Dynamic DLL', icon: 'plug' };
        }
        if (hasLib) {
            return { type: 'Static .lib', icon: 'archive' };
        }
        if (hasInclude) {
            return { type: 'Header-only', icon: 'file-submodule' };
        }
        return { type: 'Vendor lib', icon: 'package' };
    }
    formatTargetType(type) {
        switch (type.toLowerCase()) {
            case 'exe':
                return 'Application (.exe)';
            case 'static':
                return 'Static Library (.lib)';
            case 'dynamic':
                return 'Dynamic Library (.dll)';
            case 'header-only':
                return 'Header-Only Library';
            default:
                return type;
        }
    }
    getTargetTypeIcon(type) {
        switch (type.toLowerCase()) {
            case 'exe':
                return new vscode.ThemeIcon('rocket');
            case 'static':
                return new vscode.ThemeIcon('archive');
            case 'dynamic':
                return new vscode.ThemeIcon('plug');
            case 'header-only':
                return new vscode.ThemeIcon('symbol-interface');
            default:
                return new vscode.ThemeIcon('package');
        }
    }
    getFileIcon(filename) {
        const ext = path.extname(filename).toLowerCase();
        switch (ext) {
            case '.exe':
                return new vscode.ThemeIcon('rocket');
            case '.dll':
            case '.so':
                return new vscode.ThemeIcon('plug');
            case '.lib':
            case '.a':
                return new vscode.ThemeIcon('archive');
            case '.pdb':
                return new vscode.ThemeIcon('debug');
            default:
                return new vscode.ThemeIcon('file');
        }
    }
}
exports.SugarProjectTreeDataProvider = SugarProjectTreeDataProvider;
//# sourceMappingURL=treeView.js.map