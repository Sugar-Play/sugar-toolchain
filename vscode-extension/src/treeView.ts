import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { SugarStateManager } from './state';

export class SugarProjectTreeItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly contextValue?: string,
    public readonly command?: vscode.Command,
    public readonly description?: string,
    public readonly iconPath?: vscode.ThemeIcon | string
  ) {
    super(label, collapsibleState);
    if (description) this.description = description;
    if (iconPath) this.iconPath = iconPath;
    if (command) this.command = command;
  }
}

export class SugarProjectTreeDataProvider implements vscode.TreeDataProvider<SugarProjectTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<SugarProjectTreeItem | undefined | null | void>();
  public readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(private state: SugarStateManager) {
    this.state.onDidChangeState(() => this.refresh());
  }

  public refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  public getTreeItem(element: SugarProjectTreeItem): vscode.TreeItem {
    return element;
  }

  public async getChildren(element?: SugarProjectTreeItem): Promise<SugarProjectTreeItem[]> {
    const root = this.state.getWorkspaceRoot();
    if (!root || !this.state.hasProject) {
      return [
        new SugarProjectTreeItem(
          'No Sugar++ project detected',
          vscode.TreeItemCollapsibleState.None,
          'empty',
          { command: 'sugarpp.init', title: 'Initialize cpp.json' },
          'Click to initialize'
        ),
      ];
    }

    const activeConfig = this.state.getActiveConfig();
    const projName = activeConfig?.name || this.state.activeProjectName || 'app';
    const targetType = activeConfig?.type || 'exe';

    if (!element) {
      // Top-level Visual Studio Solution Explorer project root
      const typeLabel = this.formatTargetType(targetType);
      const rootItem = new SugarProjectTreeItem(
        projName,
        vscode.TreeItemCollapsibleState.Expanded,
        'solutionProject',
        undefined,
        `(${typeLabel})`,
        this.getTargetTypeIcon(targetType)
      );

      return [rootItem];
    }

    // Children of Solution Project Root: Visual Studio Filters / Groups
    if (element.contextValue === 'solutionProject') {
      const items: SugarProjectTreeItem[] = [];

      // 1. Source Files Filter (*.cpp, *.c)
      items.push(
        new SugarProjectTreeItem(
          'Source Files',
          vscode.TreeItemCollapsibleState.Expanded,
          'sourceFilesFilter',
          undefined,
          undefined,
          new vscode.ThemeIcon('folder')
        )
      );

      // 2. Header Files Filter (*.h, *.hpp)
      items.push(
        new SugarProjectTreeItem(
          'Header Files',
          vscode.TreeItemCollapsibleState.Expanded,
          'headerFilesFilter',
          undefined,
          undefined,
          new vscode.ThemeIcon('folder')
        )
      );

      // 3. References & Libraries
      items.push(
        new SugarProjectTreeItem(
          'References & Libraries',
          vscode.TreeItemCollapsibleState.Collapsed,
          'referencesFilter',
          undefined,
          undefined,
          new vscode.ThemeIcon('references')
        )
      );

      // 4. Build Outputs (target/)
      items.push(
        new SugarProjectTreeItem(
          'Build Outputs',
          vscode.TreeItemCollapsibleState.Collapsed,
          'outputsFilter',
          undefined,
          'target/',
          new vscode.ThemeIcon('output')
        )
      );

      // 5. Project Properties
      items.push(
        new SugarProjectTreeItem(
          'Properties',
          vscode.TreeItemCollapsibleState.Collapsed,
          'propertiesFilter',
          undefined,
          undefined,
          new vscode.ThemeIcon('settings-gear')
        )
      );

      return items;
    }

    // --- 1. SOURCE FILES FILTER ---
    if (element.contextValue === 'sourceFilesFilter') {
      const items: SugarProjectTreeItem[] = [];
      const srcDir = path.join(root, activeConfig?.srcDir || 'src');

      if (fs.existsSync(srcDir)) {
        const files = this.scanFiles(srcDir, ['.cpp', '.cxx', '.cc', '.c']);
        for (const file of files) {
          items.push(
            new SugarProjectTreeItem(
              file.relPath,
              vscode.TreeItemCollapsibleState.None,
              'sourceFile',
              {
                command: 'vscode.open',
                title: 'Open File',
                arguments: [vscode.Uri.file(file.fullPath)],
              },
              file.ext,
              new vscode.ThemeIcon('file-code')
            )
          );
        }
      }

      // Add New Source File action
      items.push(
        new SugarProjectTreeItem(
          '+ Add Source File (.cpp)...',
          vscode.TreeItemCollapsibleState.None,
          'addItem',
          { command: 'sugarpp.addSourceFile', title: 'Add Source File' },
          undefined,
          new vscode.ThemeIcon('add')
        )
      );

      return items;
    }

    // --- 2. HEADER FILES FILTER ---
    if (element.contextValue === 'headerFilesFilter') {
      const items: SugarProjectTreeItem[] = [];
      const searchDirs = [
        path.join(root, activeConfig?.srcDir || 'src'),
        path.join(root, 'include'),
      ];

      for (const sDir of searchDirs) {
        if (fs.existsSync(sDir)) {
          const files = this.scanFiles(sDir, ['.hpp', '.h', '.hxx', '.inl']);
          for (const file of files) {
            items.push(
              new SugarProjectTreeItem(
                file.relPath,
                vscode.TreeItemCollapsibleState.None,
                'headerFile',
                {
                  command: 'vscode.open',
                  title: 'Open File',
                  arguments: [vscode.Uri.file(file.fullPath)],
                },
                file.ext,
                new vscode.ThemeIcon('symbol-interface')
              )
            );
          }
        }
      }

      // Add New Header File action
      items.push(
        new SugarProjectTreeItem(
          '+ Add Header File (.hpp)...',
          vscode.TreeItemCollapsibleState.None,
          'addItem',
          { command: 'sugarpp.addHeaderFile', title: 'Add Header File' },
          undefined,
          new vscode.ThemeIcon('add')
        )
      );

      // Add Class (Header + Source)
      items.push(
        new SugarProjectTreeItem(
          '+ Add New C++ Class...',
          vscode.TreeItemCollapsibleState.None,
          'addItem',
          { command: 'sugarpp.addClass', title: 'Add Class' },
          undefined,
          new vscode.ThemeIcon('symbol-class')
        )
      );

      return items;
    }

    // --- 3. REFERENCES & LIBRARIES ---
    if (element.contextValue === 'referencesFilter') {
      const items: SugarProjectTreeItem[] = [];
      const vendorDir = path.join(root, activeConfig?.vendorDir || 'vendor');

      if (fs.existsSync(vendorDir)) {
        try {
          const entries = fs.readdirSync(vendorDir, { withFileTypes: true });
          for (const entry of entries) {
            if (entry.isDirectory()) {
              const vPath = path.join(vendorDir, entry.name);
              const info = this.inspectVendorLib(vPath);
              items.push(
                new SugarProjectTreeItem(
                  entry.name,
                  vscode.TreeItemCollapsibleState.None,
                  'vendorLib',
                  undefined,
                  `(${info.type})`,
                  new vscode.ThemeIcon(info.icon)
                )
              );
            }
          }
        } catch {
          // ignore
        }
      }

      // Linked System Libraries (libs from cpp.json)
      const libs = activeConfig?.libs || [];
      for (const lib of libs) {
        items.push(
          new SugarProjectTreeItem(
            lib,
            vscode.TreeItemCollapsibleState.None,
            'sysLib',
            undefined,
            '(system lib)',
            new vscode.ThemeIcon('library')
          )
        );
      }

      return items;
    }

    // --- 4. BUILD OUTPUTS ---
    if (element.contextValue === 'outputsFilter') {
      const items: SugarProjectTreeItem[] = [];
      const targetDir = path.join(root, activeConfig?.targetDir || 'target');

      if (fs.existsSync(targetDir)) {
        const binDir = path.join(targetDir, 'bin');
        if (fs.existsSync(binDir)) {
          const binFiles = fs.readdirSync(binDir);
          for (const bf of binFiles) {
            const fullP = path.join(binDir, bf);
            const stat = fs.statSync(fullP);
            const sizeKb = (stat.size / 1024).toFixed(1) + ' KB';
            items.push(
              new SugarProjectTreeItem(
                bf,
                vscode.TreeItemCollapsibleState.None,
                'artifact',
                {
                  command: 'revealFileInOS',
                  title: 'Show in Explorer',
                  arguments: [vscode.Uri.file(fullP)],
                },
                sizeKb,
                this.getFileIcon(bf)
              )
            );
          }
        }

        const libDir = path.join(targetDir, 'lib');
        if (fs.existsSync(libDir)) {
          const libFiles = fs.readdirSync(libDir);
          for (const lf of libFiles) {
            const fullP = path.join(libDir, lf);
            const stat = fs.statSync(fullP);
            const sizeKb = (stat.size / 1024).toFixed(1) + ' KB';
            items.push(
              new SugarProjectTreeItem(
                lf,
                vscode.TreeItemCollapsibleState.None,
                'artifact',
                {
                  command: 'revealFileInOS',
                  title: 'Show in Explorer',
                  arguments: [vscode.Uri.file(fullP)],
                },
                sizeKb,
                new vscode.ThemeIcon('archive')
              )
            );
          }
        }
      }

      if (items.length === 0) {
        items.push(
          new SugarProjectTreeItem(
            'No build outputs yet',
            vscode.TreeItemCollapsibleState.None,
            'info',
            { command: 'sugarpp.build', title: 'Build Project' },
            'Click to build'
          )
        );
      }

      return items;
    }

    // --- 5. PROPERTIES ---
    if (element.contextValue === 'propertiesFilter') {
      const cfg = this.state.getActiveConfig();
      const currentType = cfg?.type || 'exe';

      return [
        new SugarProjectTreeItem(
          `Target Type: ${this.formatTargetType(currentType)}`,
          vscode.TreeItemCollapsibleState.None,
          'propertyAction',
          { command: 'sugarpp.selectTargetType', title: 'Change Target Type' },
          'Click to change',
          new vscode.ThemeIcon('symbol-structure')
        ),
        new SugarProjectTreeItem(
          `Configuration: ${this.state.activeProfile.toUpperCase()}`,
          vscode.TreeItemCollapsibleState.None,
          'propertyAction',
          { command: 'sugarpp.selectProfile', title: 'Change Profile' },
          'Click to change',
          new vscode.ThemeIcon('gear')
        ),
        new SugarProjectTreeItem(
          `Compiler: ${this.state.activeCompiler.toUpperCase()}`,
          vscode.TreeItemCollapsibleState.None,
          'propertyAction',
          { command: 'sugarpp.selectCompiler', title: 'Change Compiler' },
          'Click to change',
          new vscode.ThemeIcon('tools')
        ),
        new SugarProjectTreeItem(
          `C++ Standard: ${cfg?.std || 'c++20'}`,
          vscode.TreeItemCollapsibleState.None,
          'info',
          undefined,
          undefined,
          new vscode.ThemeIcon('tag')
        ),
        new SugarProjectTreeItem(
          `Optimization: ${cfg?.optimization || 'O2'}`,
          vscode.TreeItemCollapsibleState.None,
          'info',
          undefined,
          undefined,
          new vscode.ThemeIcon('zap')
        ),
      ];
    }

    return [];
  }

  private scanFiles(dir: string, extensions: string[]): { relPath: string; fullPath: string; ext: string }[] {
    const results: { relPath: string; fullPath: string; ext: string }[] = [];

    const walk = (currentDir: string, baseDir: string) => {
      try {
        const entries = fs.readdirSync(currentDir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(currentDir, entry.name);
          if (entry.isDirectory()) {
            walk(fullPath, baseDir);
          } else if (entry.isFile()) {
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
      } catch {
        // ignore read error
      }
    };

    walk(dir, dir);
    return results;
  }

  private inspectVendorLib(vendorPath: string): { type: string; icon: string } {
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

  private formatTargetType(type: string): string {
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

  private getTargetTypeIcon(type: string): vscode.ThemeIcon {
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

  private getFileIcon(filename: string): vscode.ThemeIcon {
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
