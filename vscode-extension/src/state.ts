import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { BuildProfile, CompilerType, ProjectConfig, WorkspaceInfo, WorkspaceProject } from './types';

export class SugarStateManager {
  private _onDidChangeState = new vscode.EventEmitter<void>();
  public readonly onDidChangeState = this._onDidChangeState.event;

  private _activeProfile: BuildProfile = 'release';
  private _activeCompiler: CompilerType = 'auto';
  private _activeProjectName: string | undefined;
  private _projectConfig: ProjectConfig | null = null;
  private _workspaceInfo: WorkspaceInfo | null = null;

  constructor(private context: vscode.ExtensionContext) {
    this.loadState();
    this.refresh();
  }

  public get activeProfile(): BuildProfile {
    return this._activeProfile;
  }

  public async setActiveProfile(profile: BuildProfile): Promise<void> {
    this._activeProfile = profile;
    await this.context.workspaceState.update('sugarpp.activeProfile', profile);
    this._onDidChangeState.fire();
  }

  public get activeCompiler(): CompilerType {
    return this._activeCompiler;
  }

  public async setActiveCompiler(compiler: CompilerType): Promise<void> {
    this._activeCompiler = compiler;
    await this.context.workspaceState.update('sugarpp.activeCompiler', compiler);
    this._onDidChangeState.fire();
  }

  public get activeProjectName(): string | undefined {
    return this._activeProjectName;
  }

  public async setActiveProjectName(name: string | undefined): Promise<void> {
    this._activeProjectName = name;
    await this.context.workspaceState.update('sugarpp.activeProjectName', name);
    this._onDidChangeState.fire();
  }

  public get projectConfig(): ProjectConfig | null {
    return this._projectConfig;
  }

  public get workspaceInfo(): WorkspaceInfo | null {
    return this._workspaceInfo;
  }

  public get hasProject(): boolean {
    return this._projectConfig !== null || this._workspaceInfo !== null;
  }

  public getWorkspaceRoot(): string | undefined {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) {
      return undefined;
    }
    return folders[0].uri.fsPath;
  }

  public getActiveProjectDir(): string | undefined {
    const root = this.getWorkspaceRoot();
    if (!root) return undefined;

    if (this._workspaceInfo && this._activeProjectName) {
      const proj = this._workspaceInfo.projects.find((p) => p.name === this._activeProjectName);
      if (proj) return proj.dir;
    }

    return root;
  }

  public getExecutablePath(): string | undefined {
    const root = this.getActiveProjectDir();
    if (!root) return undefined;

    const config = this.getActiveConfig();
    const out = config?.output || 'target/bin/app.exe';

    if (path.isAbsolute(out)) {
      return out;
    }
    return path.join(root, out);
  }

  public getActiveConfig(): ProjectConfig | null {
    if (this._workspaceInfo && this._activeProjectName) {
      const proj = this._workspaceInfo.projects.find((p) => p.name === this._activeProjectName);
      if (proj) return proj.config;
    }
    return this._projectConfig;
  }

  public refresh(): void {
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
      } catch {
        this._projectConfig = null;
      }
    } else {
      this._projectConfig = null;
    }

    // Check workspace.json
    const wsJsonPath = path.join(root, 'workspace.json');
    if (fs.existsSync(wsJsonPath)) {
      try {
        const raw = fs.readFileSync(wsJsonPath, 'utf8');
        const parsed = JSON.parse(raw);
        this.discoverWorkspaceProjects(root, parsed);
      } catch {
        this._workspaceInfo = null;
      }
    } else {
      this._workspaceInfo = null;
    }

    const hasProj = this.hasProject;
    vscode.commands.executeCommand('setContext', 'sugarpp:hasProject', hasProj);
    this._onDidChangeState.fire();
  }

  private discoverWorkspaceProjects(rootDir: string, wsConfig: any): void {
    const projects: WorkspaceProject[] = [];

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

    const patterns: string[] = wsConfig.projects || [];
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
                } catch {
                  // ignore invalid json
                }
              }
            }
          }
        } catch {
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

  private loadState(): void {
    const savedProfile = this.context.workspaceState.get<BuildProfile>('sugarpp.activeProfile');
    if (savedProfile) {
      this._activeProfile = savedProfile;
    } else {
      const defaultProfile = vscode.workspace.getConfiguration('sugarpp').get<BuildProfile>('defaultProfile', 'release');
      this._activeProfile = defaultProfile;
    }

    const savedCompiler = this.context.workspaceState.get<CompilerType>('sugarpp.activeCompiler');
    if (savedCompiler) {
      this._activeCompiler = savedCompiler;
    } else {
      const defaultCompiler = vscode.workspace.getConfiguration('sugarpp').get<CompilerType>('defaultCompiler', 'auto');
      this._activeCompiler = defaultCompiler;
    }

    this._activeProjectName = this.context.workspaceState.get<string>('sugarpp.activeProjectName');
  }
}
