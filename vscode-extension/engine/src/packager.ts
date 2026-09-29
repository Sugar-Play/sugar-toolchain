import * as fs from 'node:fs';
import * as path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type {
  PackageOptions,
  PackageResult,
  WorkspaceInfo,
  WorkspaceProject,
  CompileOptions,
} from './types.js';
import { findConfigFile, loadConfigFile, discoverWorkspace, findProjectInWorkspace } from './config.js';
import { compile } from './index.js';
import { buildWithDependencies } from './workspace.js';

const execFileAsync = promisify(execFile);

function copyRecursiveSync(src: string, dest: string) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }
    const entries = fs.readdirSync(src);
    for (const entry of entries) {
      copyRecursiveSync(path.join(src, entry), path.join(dest, entry));
    }
  } else {
    const parent = path.dirname(dest);
    if (!fs.existsSync(parent)) {
      fs.mkdirSync(parent, { recursive: true });
    }
    fs.copyFileSync(src, dest);
  }
}

async function createZipArchive(sourceDir: string, zipPath: string): Promise<boolean> {
  if (fs.existsSync(zipPath)) {
    try {
      fs.unlinkSync(zipPath);
    } catch {}
  }

  const isWindows = process.platform === 'win32';
  try {
    if (isWindows) {
      const psCommand = `Compress-Archive -Path "${path.join(sourceDir, '*')}" -DestinationPath "${zipPath}" -Force`;
      await execFileAsync('powershell', ['-NoProfile', '-Command', psCommand], { windowsHide: true });
      return fs.existsSync(zipPath);
    } else {
      await execFileAsync('zip', ['-r', zipPath, '.'], { cwd: sourceDir });
      return fs.existsSync(zipPath);
    }
  } catch {
    return false;
  }
}

export async function packageProject(options: PackageOptions = {}): Promise<PackageResult> {
  const startTime = Date.now();
  const rootDir = options.workingDir || process.cwd();
  const workspace = discoverWorkspace(rootDir);

  let targetDir = rootDir;
  let targetProject: WorkspaceProject | undefined;

  if (workspace) {
    if (options.project) {
      targetProject = findProjectInWorkspace(workspace, options.project);
      if (!targetProject) {
        throw new Error(`Project "${options.project}" not found in workspace.`);
      }
      targetDir = targetProject.dir;
    } else {
      // Use root project if available, or first exe project
      targetProject = workspace.projects.find((p) => p.isRoot) || workspace.projects.find((p) => p.config.type !== 'header-only');
      if (targetProject) {
        targetDir = targetProject.dir;
      }
    }
  }

  const configPath = findConfigFile(targetDir);
  if (!configPath) {
    throw new Error(`No cpp.json found in "${targetDir}".`);
  }

  const config = loadConfigFile(configPath);
  const name = config.name || path.basename(targetDir);
  const version = config.version || '1.0.0';
  const profile = options.profile || 'release';
  const platform = process.platform;
  const arch = process.arch;

  // 1. Build the project (release by default for packaging)
  const compileOptions: Partial<CompileOptions> = {
    workingDir: targetDir,
    profile,
    compiler: options.compiler,
    clean: options.clean,
  };

  let compileResult;
  if (targetProject && workspace && targetProject.config.dependsOn && targetProject.config.dependsOn.length > 0) {
    compileResult = await buildWithDependencies(targetProject, workspace, compileOptions);
  } else {
    compileResult = await compile(compileOptions);
  }

  if (!compileResult.success) {
    throw new Error(`Build failed prior to packaging:\n${compileResult.stderr || compileResult.stdout}`);
  }

  // 2. Prepare package directory
  const distBase = options.distDir
    ? path.resolve(rootDir, options.distDir)
    : path.resolve(rootDir, 'dist');

  const packageName = `${name}-${version}-${platform}-${arch}`;
  const packageDir = path.join(distBase, packageName);

  if (fs.existsSync(packageDir)) {
    fs.rmSync(packageDir, { recursive: true, force: true });
  }
  fs.mkdirSync(packageDir, { recursive: true });

  const copiedFiles: string[] = [];

  // 3. Copy executable or library
  const exePath = compileResult.executablePath;
  if (fs.existsSync(exePath)) {
    const destExe = path.join(packageDir, path.basename(exePath));
    fs.copyFileSync(exePath, destExe);
    copiedFiles.push(path.basename(exePath));
  }

  // 4. Copy runtime DLLs from target/bin or vendor
  const binDir = path.dirname(exePath);
  const isWindows = process.platform === 'win32';
  const dllExt = isWindows ? '.dll' : '.so';

  if (fs.existsSync(binDir)) {
    const binFiles = fs.readdirSync(binDir);
    for (const file of binFiles) {
      if (file.toLowerCase().endsWith(dllExt)) {
        const destDll = path.join(packageDir, file);
        fs.copyFileSync(path.join(binDir, file), destDll);
        copiedFiles.push(file);
      }
    }
  }

  // 5. Copy user-configured assets or standard folders (assets/, resources/, config/)
  const assetSources = config.assets || ['assets', 'resources', 'config'];
  for (const assetRel of assetSources) {
    const assetPath = path.resolve(targetDir, assetRel);
    if (fs.existsSync(assetPath)) {
      const destAsset = path.join(packageDir, path.basename(assetPath));
      copyRecursiveSync(assetPath, destAsset);
      copiedFiles.push(path.basename(assetPath) + (fs.statSync(assetPath).isDirectory() ? '/' : ''));
    }
  }

  // 6. Write package info manifest
  const manifest = {
    name,
    version,
    platform,
    architecture: arch,
    compiler: compileResult.compiler.name,
    profile,
    packagedAt: new Date().toISOString(),
    files: copiedFiles,
  };
  fs.writeFileSync(path.join(packageDir, 'package-info.json'), JSON.stringify(manifest, null, 2), 'utf8');
  copiedFiles.push('package-info.json');

  // 7. Optional Zip Archive
  let zipPath: string | undefined;
  if (options.zip) {
    const zipTarget = `${packageDir}.zip`;
    const zipped = await createZipArchive(packageDir, zipTarget);
    if (zipped) {
      zipPath = zipTarget;
    }
  }

  return {
    success: true,
    packageName,
    packageDir,
    zipPath,
    executablePath: exePath,
    copiedFiles: [...new Set(copiedFiles)],
    durationMs: Date.now() - startTime,
  };
}
