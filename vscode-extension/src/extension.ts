import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { SugarStateManager } from './state';
import { SugarStatusBarManager } from './statusBar';
import { SugarExecutor } from './executor';
import { SugarDebugger } from './debugger';
import { SugarProjectTreeDataProvider } from './treeView';
import { BuildProfile, CompilerType } from './types';

export function activate(context: vscode.ExtensionContext): void {
  const state = new SugarStateManager(context);
  const statusBar = new SugarStatusBarManager(state);
  const executor = new SugarExecutor(state, context);
  const sugarDebugger = new SugarDebugger(state, executor);
  const treeDataProvider = new SugarProjectTreeDataProvider(state);

  // Register Tree Views
  vscode.window.registerTreeDataProvider('sugarpp.projectExplorer', treeDataProvider);
  vscode.window.registerTreeDataProvider('sugarpp.projectExplorerSide', treeDataProvider);

  // File system watchers for configuration changes
  const root = state.getWorkspaceRoot();
  if (root) {
    const watcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(root, '{cpp.json,workspace.json}')
    );
    watcher.onDidChange(() => state.refresh());
    watcher.onDidCreate(() => state.refresh());
    watcher.onDidDelete(() => state.refresh());
    context.subscriptions.push(watcher);
  }

  // --- COMMANDS ---

  // 1. Build
  const buildCmd = vscode.commands.registerCommand('sugarpp.build', async () => {
    await executor.build();
  });

  // 2. Clean
  const cleanCmd = vscode.commands.registerCommand('sugarpp.clean', async () => {
    await executor.clean();
  });

  // 3. Rebuild
  const rebuildCmd = vscode.commands.registerCommand('sugarpp.rebuild', async () => {
    await executor.build({ rebuild: true });
  });

  // 4. Run
  const runCmd = vscode.commands.registerCommand('sugarpp.run', async () => {
    await executor.run();
  });

  // 5. Debug
  const debugCmd = vscode.commands.registerCommand('sugarpp.debug', async () => {
    await sugarDebugger.startDebugging();
  });

  // 6. Select Solution Configuration (Notification Style Popup)
  const selectProfileCmd = vscode.commands.registerCommand('sugarpp.selectProfile', async () => {
    const current = state.activeProfile;
    const choice = await vscode.window.showInformationMessage(
      `Solution Configuration (Active: ${current.toUpperCase()}):`,
      'Debug',
      'Release',
      'RelWithDebInfo',
      'MinSizeRel'
    );

    if (choice) {
      await state.setActiveProfile(choice.toLowerCase() as BuildProfile);
      vscode.window.setStatusBarMessage(`Sugar++ Configuration: ${choice}`, 3000);
    }
  });

  const setProfileDirectCmd = vscode.commands.registerCommand('sugarpp.setProfileDirect', async (profile: BuildProfile) => {
    if (profile) {
      await state.setActiveProfile(profile);
      vscode.window.setStatusBarMessage(`Sugar++ Configuration: ${profile}`, 3000);
    }
  });

  // 7. Select Solution Platform / Compiler (Notification Style Popup)
  const selectCompilerCmd = vscode.commands.registerCommand('sugarpp.selectCompiler', async () => {
    const current = state.activeCompiler;
    const choice = await vscode.window.showInformationMessage(
      `Solution Platform / Compiler (Active: ${current.toUpperCase()}):`,
      'Auto',
      'MSVC',
      'GCC',
      'Clang'
    );

    if (choice) {
      await state.setActiveCompiler(choice.toLowerCase() as CompilerType);
      vscode.window.setStatusBarMessage(`Sugar++ Compiler: ${choice}`, 3000);
    }
  });

  const setCompilerDirectCmd = vscode.commands.registerCommand('sugarpp.setCompilerDirect', async (compiler: CompilerType) => {
    if (compiler) {
      await state.setActiveCompiler(compiler);
      vscode.window.setStatusBarMessage(`Sugar++ Compiler: ${compiler}`, 3000);
    }
  });

  // 8. Select Project
  const selectProjectCmd = vscode.commands.registerCommand('sugarpp.selectProject', async (targetName?: string) => {
    if (targetName) {
      await state.setActiveProjectName(targetName);
      return;
    }

    if (!state.workspaceInfo || state.workspaceInfo.projects.length <= 1) {
      vscode.window.showInformationMessage(`Single project: ${state.projectConfig?.name || 'app'}`);
      return;
    }

    const items: (vscode.QuickPickItem & { target?: string })[] = [
      {
        label: '$(layers) [All Projects]',
        description: 'Build all workspace targets',
        target: 'all',
      },
      ...state.workspaceInfo.projects.map((p) => ({
        label: `$(folder) ${p.name}`,
        description: `(${p.config.type || 'exe'}) - ${p.relDir}`,
        target: p.name,
      })),
    ];

    const selected = await vscode.window.showQuickPick(items, {
      placeHolder: 'Select Active Workspace Target',
      title: 'Sugar++: Target Selection',
    });

    if (selected) {
      await state.setActiveProjectName(selected.target);
      vscode.window.setStatusBarMessage(`Sugar++ Target set to: ${selected.target}`, 3000);
    }
  });

  // 9. Package
  const packageCmd = vscode.commands.registerCommand('sugarpp.package', async () => {
    await executor.package();
  });

  // 10. Watch Mode
  const watchCmd = vscode.commands.registerCommand('sugarpp.toggleWatch', () => {
    executor.toggleWatch((isWatching) => {
      statusBar.setWatching(isWatching);
    });
  });

  // 11. Init
  const initCmd = vscode.commands.registerCommand('sugarpp.init', async () => {
    const rootDir = state.getWorkspaceRoot();
    if (!rootDir) return;

    const cppJson = path.join(rootDir, 'cpp.json');
    if (fs.existsSync(cppJson)) {
      vscode.window.showInformationMessage('cpp.json already exists in workspace root.');
      return;
    }

    const template = {
      name: path.basename(rootDir),
      version: '1.0.0',
      type: 'exe',
      compiler: 'auto',
      std: 'c++20',
      optimization: 'O2',
      debug: false,
      srcDir: 'src',
      vendorDir: 'vendor',
      targetDir: 'target',
      binDir: 'target/bin',
      output: 'target/bin/app.exe',
      sources: ['src/**/*.cpp'],
    };

    fs.writeFileSync(cppJson, JSON.stringify(template, null, 2), 'utf8');
    state.refresh();
    vscode.window.showInformationMessage('Sugar++: Initialized cpp.json');
  });

  // 12. Show Output
  const showOutputCmd = vscode.commands.registerCommand('sugarpp.showOutput', () => {
    executor.showOutput();
  });

  // 13. Open Custom Popup Dropdown
  const openCustomPopupCmd = vscode.commands.registerCommand('sugarpp.openCustomPopup', () => {
    vscode.commands.executeCommand('sugarpp.selectProfile');
  });

  const showMenuCmd = vscode.commands.registerCommand('sugarpp.showMenu', () => {
    vscode.commands.executeCommand('sugarpp.selectProfile');
  });

  // 14. Select Target Type (exe, static lib, dynamic dll, header-only)
  const selectTargetTypeCmd = vscode.commands.registerCommand('sugarpp.selectTargetType', async () => {
    const rootDir = state.getWorkspaceRoot();
    if (!rootDir) return;

    const cppJsonPath = path.join(rootDir, 'cpp.json');
    if (!fs.existsSync(cppJsonPath)) return;

    const items: (vscode.QuickPickItem & { targetType: 'exe' | 'static' | 'dynamic' | 'header-only' })[] = [
      {
        label: '$(rocket) Application (.exe)',
        description: 'Standard executable application',
        detail: 'Builds to target/bin/<name>.exe',
        targetType: 'exe',
      },
      {
        label: '$(archive) Static Library (.lib / .a)',
        description: 'Statically linked library archive',
        detail: 'Builds to target/lib/<name>.lib',
        targetType: 'static',
      },
      {
        label: '$(plug) Dynamic Library (.dll / .so)',
        description: 'Shared dynamic link library',
        detail: 'Builds to target/bin/<name>.dll and target/lib/<name>.lib',
        targetType: 'dynamic',
      },
      {
        label: '$(symbol-interface) Header-Only Library',
        description: 'Header files only, no binary compilation',
        detail: 'Include directory for other projects',
        targetType: 'header-only',
      },
    ];

    const selected = await vscode.window.showQuickPick(items, {
      title: 'Visual Studio: Select Project Target Type',
      placeHolder: 'Select target output type...',
    });

    if (!selected) return;

    try {
      const raw = fs.readFileSync(cppJsonPath, 'utf8');
      const cfg = JSON.parse(raw);
      cfg.type = selected.targetType;

      const baseName = cfg.name || path.basename(rootDir);
      if (selected.targetType === 'exe') {
        cfg.output = `target/bin/${baseName}.exe`;
      } else if (selected.targetType === 'static') {
        cfg.output = `target/lib/${baseName}.lib`;
      } else if (selected.targetType === 'dynamic') {
        cfg.output = `target/bin/${baseName}.dll`;
      }

      fs.writeFileSync(cppJsonPath, JSON.stringify(cfg, null, 2), 'utf8');
      state.refresh();
      vscode.window.showInformationMessage(`Project target type set to: ${selected.label}`);
    } catch (err: any) {
      vscode.window.showErrorMessage(`Failed to update cpp.json: ${err.message}`);
    }
  });

  // 15. Add New Source File (.cpp)
  const addSourceFileCmd = vscode.commands.registerCommand('sugarpp.addSourceFile', async () => {
    const rootDir = state.getWorkspaceRoot();
    if (!rootDir) return;

    const inputName = await vscode.window.showInputBox({
      title: 'Add New C++ Source File',
      prompt: 'Enter file name (e.g. math.cpp)',
      placeHolder: 'filename.cpp',
    });

    if (!inputName || !inputName.trim()) return;

    let filename = inputName.trim();
    if (!filename.endsWith('.cpp') && !filename.endsWith('.cxx') && !filename.endsWith('.c')) {
      filename += '.cpp';
    }

    const srcDir = path.join(rootDir, state.getActiveConfig()?.srcDir || 'src');
    if (!fs.existsSync(srcDir)) {
      fs.mkdirSync(srcDir, { recursive: true });
    }

    const filePath = path.join(srcDir, filename);
    if (fs.existsSync(filePath)) {
      vscode.window.showErrorMessage(`File already exists: ${filename}`);
      return;
    }

    const template = `//\n// ${filename}\n//\n\n#include <iostream>\n\n`;
    fs.writeFileSync(filePath, template, 'utf8');
    treeDataProvider.refresh();

    const doc = await vscode.workspace.openTextDocument(filePath);
    await vscode.window.showTextDocument(doc);
  });

  // 16. Add New Header File (.hpp)
  const addHeaderFileCmd = vscode.commands.registerCommand('sugarpp.addHeaderFile', async () => {
    const rootDir = state.getWorkspaceRoot();
    if (!rootDir) return;

    const inputName = await vscode.window.showInputBox({
      title: 'Add New C++ Header File',
      prompt: 'Enter header file name (e.g. math.hpp)',
      placeHolder: 'filename.hpp',
    });

    if (!inputName || !inputName.trim()) return;

    let filename = inputName.trim();
    if (!filename.endsWith('.hpp') && !filename.endsWith('.h') && !filename.endsWith('.hxx')) {
      filename += '.hpp';
    }

    const srcDir = path.join(rootDir, state.getActiveConfig()?.srcDir || 'src');
    if (!fs.existsSync(srcDir)) {
      fs.mkdirSync(srcDir, { recursive: true });
    }

    const filePath = path.join(srcDir, filename);
    if (fs.existsSync(filePath)) {
      vscode.window.showErrorMessage(`File already exists: ${filename}`);
      return;
    }

    const template = `#pragma once\n\n// Declarations for ${filename}\n\n`;
    fs.writeFileSync(filePath, template, 'utf8');
    treeDataProvider.refresh();

    const doc = await vscode.workspace.openTextDocument(filePath);
    await vscode.window.showTextDocument(doc);
  });

  // 17. Add New Class (.hpp + .cpp)
  const addClassCmd = vscode.commands.registerCommand('sugarpp.addClass', async () => {
    const rootDir = state.getWorkspaceRoot();
    if (!rootDir) return;

    const className = await vscode.window.showInputBox({
      title: 'Add New C++ Class',
      prompt: 'Enter class name (e.g. EngineCore)',
      placeHolder: 'ClassName',
    });

    if (!className || !className.trim()) return;

    const cleanName = className.trim();
    const baseFile = cleanName.toLowerCase();
    const headerFile = `${baseFile}.hpp`;
    const sourceFile = `${baseFile}.cpp`;

    const srcDir = path.join(rootDir, state.getActiveConfig()?.srcDir || 'src');
    if (!fs.existsSync(srcDir)) {
      fs.mkdirSync(srcDir, { recursive: true });
    }

    const headerPath = path.join(srcDir, headerFile);
    const sourcePath = path.join(srcDir, sourceFile);

    if (fs.existsSync(headerPath) || fs.existsSync(sourcePath)) {
      vscode.window.showErrorMessage(`Class files already exist for: ${cleanName}`);
      return;
    }

    const headerContent = `#pragma once\n\nclass ${cleanName} {\npublic:\n    ${cleanName}();\n    ~${cleanName}();\n};\n`;
    const sourceContent = `#include "${headerFile}"\n\n${cleanName}::${cleanName}() {\n}\n\n${cleanName}::~${cleanName}() {\n}\n`;

    fs.writeFileSync(headerPath, headerContent, 'utf8');
    fs.writeFileSync(sourcePath, sourceContent, 'utf8');
    treeDataProvider.refresh();

    const doc = await vscode.workspace.openTextDocument(headerPath);
    await vscode.window.showTextDocument(doc);
    vscode.window.showInformationMessage(`Created class ${cleanName} (${headerFile} & ${sourceFile})`);
  });

  // 18. Create New Project / Group Target (apps/* or libs/*)
  const newProjectCmd = vscode.commands.registerCommand('sugarpp.newProject', async () => {
    const rootDir = state.getWorkspaceRoot();
    if (!rootDir) return;

    interface ProjectTypeChoice extends vscode.QuickPickItem {
      type: 'exe' | 'static' | 'dynamic';
      subfolder: string;
    }

    const typeChoices: ProjectTypeChoice[] = [
      {
        label: '$(rocket) Executable (.exe) Target',
        description: 'Creates a new application in apps/<name>/',
        detail: 'Standalone C++ executable with main.cpp',
        type: 'exe',
        subfolder: 'apps',
      },
      {
        label: '$(archive) Static Library (.lib) Target',
        description: 'Creates a new library in libs/<name>/',
        detail: 'Precompiled static archive for other projects to link',
        type: 'static',
        subfolder: 'libs',
      },
      {
        label: '$(plug) Dynamic Library (.dll) Target',
        description: 'Creates a shared library in libs/<name>/',
        detail: 'Shared runtime dynamic-link library',
        type: 'dynamic',
        subfolder: 'libs',
      },
    ];

    const selectedType = await vscode.window.showQuickPick(typeChoices, {
      title: 'Visual Studio: Create New Project / Group Target',
      placeHolder: 'Select project target type...',
    });

    if (!selectedType) return;

    const inputName = await vscode.window.showInputBox({
      title: `Create New ${selectedType.label}`,
      prompt: `Enter project name (will be created in ${selectedType.subfolder}/<name>):`,
      placeHolder: selectedType.type === 'exe' ? 'my_app' : 'my_lib',
    });

    if (!inputName || !inputName.trim()) return;

    const projName = inputName.trim().replace(/[^a-zA-Z0-9_\-]/g, '_');
    const targetDir = path.join(rootDir, selectedType.subfolder, projName);

    if (fs.existsSync(targetDir)) {
      vscode.window.showErrorMessage(`Project folder already exists: ${selectedType.subfolder}/${projName}`);
      return;
    }

    // 1. Create project directories
    const srcDir = path.join(targetDir, 'src');
    fs.mkdirSync(srcDir, { recursive: true });

    // 2. Create cpp.json
    const cppJson = {
      name: projName,
      version: '1.0.0',
      type: selectedType.type,
      description: `${projName} ${selectedType.type} target`,
      compiler: 'auto',
      std: 'c++20',
      optimization: 'O2',
      debug: false,
      srcDir: 'src',
      targetDir: 'target',
      binDir: 'target/bin',
      output: selectedType.type === 'exe'
        ? `target/bin/${projName}.exe`
        : selectedType.type === 'static'
          ? `target/lib/${projName}.lib`
          : `target/bin/${projName}.dll`,
      sources: ['src/**/*.cpp'],
      includeDirs: [],
      libDirs: [],
      libs: [],
    };
    fs.writeFileSync(path.join(targetDir, 'cpp.json'), JSON.stringify(cppJson, null, 2), 'utf8');

    // 3. Create starter source file
    let starterFile: string;
    if (selectedType.type === 'exe') {
      starterFile = path.join(srcDir, 'main.cpp');
      const mainContent = `#include <iostream>\n\nint main(int argc, char* argv[]) {\n    std::cout << "Hello from ${projName}!" << std::endl;\n    return 0;\n}\n`;
      fs.writeFileSync(starterFile, mainContent, 'utf8');
    } else {
      starterFile = path.join(srcDir, `${projName}.cpp`);
      const libHeader = path.join(srcDir, `${projName}.hpp`);
      fs.writeFileSync(libHeader, `#pragma once\n\nnamespace ${projName} {\n    void hello();\n}\n`, 'utf8');
      fs.writeFileSync(starterFile, `#include "${projName}.hpp"\n#include <iostream>\n\nnamespace ${projName} {\n    void hello() {\n        std::cout << "${projName} library loaded!" << std::endl;\n    }\n}\n`, 'utf8');
    }

    // 4. Ensure workspace.json exists and tracks the pattern
    const wsJsonPath = path.join(rootDir, 'workspace.json');
    let wsConfig: { name?: string; projects: string[] } = { name: path.basename(rootDir), projects: ['apps/*', 'libs/*'] };
    if (fs.existsSync(wsJsonPath)) {
      try {
        wsConfig = JSON.parse(fs.readFileSync(wsJsonPath, 'utf8'));
      } catch {}
    }
    const pattern = `${selectedType.subfolder}/*`;
    if (!wsConfig.projects.includes(pattern)) {
      wsConfig.projects.push(pattern);
    }
    fs.writeFileSync(wsJsonPath, JSON.stringify(wsConfig, null, 2), 'utf8');

    // 5. Refresh extension state and set as active
    await state.setActiveProjectName(projName);
    state.refresh();

    // 6. Open starter file
    const doc = await vscode.workspace.openTextDocument(starterFile);
    await vscode.window.showTextDocument(doc);

    vscode.window.showInformationMessage(`Created new ${selectedType.type} target: ${selectedType.subfolder}/${projName}`);
  });

  context.subscriptions.push(
    statusBar,
    executor,
    openCustomPopupCmd,
    showMenuCmd,
    buildCmd,
    cleanCmd,
    rebuildCmd,
    runCmd,
    debugCmd,
    selectProfileCmd,
    setProfileDirectCmd,
    selectCompilerCmd,
    setCompilerDirectCmd,
    selectTargetTypeCmd,
    addSourceFileCmd,
    addHeaderFileCmd,
    addClassCmd,
    newProjectCmd,
    selectProjectCmd,
    packageCmd,
    watchCmd,
    initCmd,
    showOutputCmd
  );
}

export function deactivate(): void {}
