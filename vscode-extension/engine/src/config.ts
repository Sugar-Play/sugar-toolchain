import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ProjectConfig, CompileOptions, ProjectType, BuildProfile, WorkspaceProject, WorkspaceInfo, WorkspaceConfig } from './types.js';
import { discoverProjectLayout } from './utils/folders.js';
import { isSourceFile } from './utils/files.js';

export const CONFIG_FILE_NAME = 'cpp.json';
export const LEGACY_CONFIG_FILE_NAME = 'cppconfig.json';
export const WORKSPACE_FILE_NAME = 'workspace.json';
export const LEGACY_WORKSPACE_FILE_NAME = 'cppworkspace.json';

export function findConfigFile(startDir: string = process.cwd()): string | null {
  let currentDir = path.resolve(startDir);
  while (true) {
    const candidatePrimary = path.join(currentDir, CONFIG_FILE_NAME);
    if (fs.existsSync(candidatePrimary)) {
      return candidatePrimary;
    }

    const candidateLegacy = path.join(currentDir, LEGACY_CONFIG_FILE_NAME);
    if (fs.existsSync(candidateLegacy)) {
      return candidateLegacy;
    }

    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      break;
    }
    currentDir = parentDir;
  }
  return null;
}

export function findWorkspaceConfigFile(startDir: string = process.cwd()): string | null {
  let currentDir = path.resolve(startDir);
  while (true) {
    const candidatePrimary = path.join(currentDir, WORKSPACE_FILE_NAME);
    if (fs.existsSync(candidatePrimary)) {
      return candidatePrimary;
    }

    const candidateLegacy = path.join(currentDir, LEGACY_WORKSPACE_FILE_NAME);
    if (fs.existsSync(candidateLegacy)) {
      return candidateLegacy;
    }

    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      break;
    }
    currentDir = parentDir;
  }
  return null;
}

export function loadConfigFile(configPath: string): ProjectConfig {
  try {
    const content = fs.readFileSync(configPath, 'utf8');
    const parsed = JSON.parse(content) as ProjectConfig;
    return parsed;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to parse configuration file at "${configPath}": ${message}`);
  }
}

export function loadWorkspaceConfigFile(configPath: string): WorkspaceConfig {
  try {
    const content = fs.readFileSync(configPath, 'utf8');
    const parsed = JSON.parse(content) as WorkspaceConfig;
    return parsed;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to parse workspace configuration file at "${configPath}": ${message}`);
  }
}

function walkSubdirectories(
  dir: string,
  ignored: Set<string>,
  maxDepth = 4,
  currentDepth = 0
): string[] {
  if (currentDepth >= maxDepth) return [];
  const results: string[] = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const lower = entry.name.toLowerCase();
      if (ignored.has(lower) || entry.name.startsWith('.')) continue;
      const fullPath = path.join(dir, entry.name);
      results.push(fullPath);
      results.push(...walkSubdirectories(fullPath, ignored, maxDepth, currentDepth + 1));
    }
  } catch {
    // Ignore unreadable dirs
  }
  return results;
}

function matchDirectoryGlob(
  baseDir: string,
  pattern: string,
  ignored: Set<string>
): string[] {
  const parts = pattern.replace(/\\/g, '/').split('/').filter(Boolean);
  let currentDirs = [baseDir];

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    const nextDirs: string[] = [];

    if (part === '**') {
      const remainingPattern = parts.slice(i + 1).join('/');
      for (const cur of currentDirs) {
        const allSubs = walkSubdirectories(cur, ignored, 4);
        if (!remainingPattern) {
          nextDirs.push(...allSubs);
        } else {
          for (const sub of allSubs) {
            nextDirs.push(...matchDirectoryGlob(sub, remainingPattern, ignored));
          }
        }
      }
      return [...new Set(nextDirs)];
    }

    const isWildcard = part.includes('*') || part.includes('?');
    const regex = isWildcard
      ? new RegExp('^' + part.replace(/\./g, '\\.').replace(/\*/g, '.*').replace(/\?/g, '.') + '$', 'i')
      : null;

    for (const cur of currentDirs) {
      if (!fs.existsSync(cur)) continue;
      try {
        const entries = fs.readdirSync(cur, { withFileTypes: true });
        for (const entry of entries) {
          if (!entry.isDirectory()) continue;
          const lower = entry.name.toLowerCase();
          if (ignored.has(lower) || entry.name.startsWith('.')) continue;

          if (regex) {
            if (regex.test(entry.name)) {
              nextDirs.push(path.join(cur, entry.name));
            }
          } else {
            if (lower === part.toLowerCase()) {
              nextDirs.push(path.join(cur, entry.name));
            }
          }
        }
      } catch {
        // Ignore read errors
      }
    }
    currentDirs = nextDirs;
  }

  return currentDirs;
}

export function findProjectInWorkspace(
  workspace: WorkspaceInfo,
  query: string
): WorkspaceProject | undefined {
  const q = query.toLowerCase().trim().replace(/\\/g, '/');
  return workspace.projects.find((p) => {
    if (p.name.toLowerCase() === q) return true;
    if (path.basename(p.dir).toLowerCase() === q) return true;
    if (p.relDir.toLowerCase() === q) return true;
    if (p.relDir.toLowerCase().endsWith('/' + q)) return true;
    return false;
  });
}

export function discoverWorkspace(rootDir: string): WorkspaceInfo | null {
  const wsConfigPath = findWorkspaceConfigFile(rootDir);
  if (!wsConfigPath) return null;

  const wsConfig = loadWorkspaceConfigFile(wsConfigPath);
  if (!Array.isArray(wsConfig.projects) || wsConfig.projects.length === 0) {
    return null;
  }

  const wsRootDir = path.dirname(wsConfigPath);

  // Directories to ignore during scanning
  const ignored = new Set([
    'node_modules',
    '.git',
    'target',
    'build',
    'dist',
    'script',
    '.vscode',
    '.idea',
    '.cache',
    'obj',
    'temp',
    'tmp',
    'vendor',
  ]);

  // Collect candidate project directories from explicit paths or glob patterns
  const candidateDirs: string[] = [];

  for (const pat of wsConfig.projects) {
    if (typeof pat !== 'string') continue;
    const trimmed = pat.trim();
    if (!trimmed) continue;

    if (trimmed.includes('*') || trimmed.includes('?')) {
      // Glob pattern (e.g. apps/*, libs/*, modules/**)
      candidateDirs.push(...matchDirectoryGlob(wsRootDir, trimmed, ignored));
    } else {
      // Direct folder path (e.g. server, client, libs/math)
      const resolved = path.resolve(wsRootDir, trimmed);
      if (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()) {
        candidateDirs.push(resolved);
      }
    }
  }

  // Deduplicate and filter out root itself
  const uniqueDirs = [...new Set(candidateDirs.map((d) => path.resolve(d)))].filter(
    (d) => d !== wsRootDir
  );

  const projects: WorkspaceProject[] = [];

  // Check if root directory itself has a cpp.json (root project)
  const rootCppJson = path.join(wsRootDir, CONFIG_FILE_NAME);
  const legacyRootCppJson = path.join(wsRootDir, LEGACY_CONFIG_FILE_NAME);
  const rootConfigPath = fs.existsSync(rootCppJson)
    ? rootCppJson
    : fs.existsSync(legacyRootCppJson)
    ? legacyRootCppJson
    : null;

  if (rootConfigPath) {
    const rootConfig = loadConfigFile(rootConfigPath);
    const rootSrcDir = path.resolve(wsRootDir, rootConfig.srcDir || 'src');
    const rootHasSources =
      (fs.existsSync(rootSrcDir) && fs.statSync(rootSrcDir).isDirectory()) ||
      (rootConfig.sources && rootConfig.sources.length > 0);

    if (rootHasSources) {
      projects.push({
        name: rootConfig.name || path.basename(wsRootDir),
        dir: wsRootDir,
        relDir: '.',
        configPath: rootConfigPath,
        config: rootConfig,
        isRoot: true,
      });
    }
  }

  for (const dir of uniqueDirs) {
    let projConfigPath = path.join(dir, CONFIG_FILE_NAME);
    if (!fs.existsSync(projConfigPath)) {
      projConfigPath = path.join(dir, LEGACY_CONFIG_FILE_NAME);
    }

    let projConfig: ProjectConfig;
    if (fs.existsSync(projConfigPath)) {
      try {
        projConfig = loadConfigFile(projConfigPath);
      } catch (err: any) {
        console.warn(`Warning: Could not parse config in ${dir}: ${err.message}`);
        continue;
      }
    } else {
      // Check if folder has source files
      const hasSrcDir = fs.existsSync(path.join(dir, 'src'));
      let hasRootSources = false;
      try {
        hasRootSources = fs.readdirSync(dir).some((f) => isSourceFile(f));
      } catch {}

      if (hasSrcDir || hasRootSources) {
        projConfig = {
          name: path.basename(dir),
          type: 'exe',
          sources: hasSrcDir ? ['src/**/*.cpp'] : ['*.cpp'],
        };
        projConfigPath = path.join(dir, CONFIG_FILE_NAME);
      } else {
        continue;
      }
    }

    const relDir = path.relative(wsRootDir, dir).replace(/\\/g, '/');
    projects.push({
      name: projConfig.name || path.basename(dir),
      dir,
      relDir,
      configPath: projConfigPath,
      config: projConfig,
      isRoot: false,
      dependencies: (projConfig as any).dependsOn,
    });
  }

  if (projects.length === 0 || projects.every((p) => p.isRoot)) {
    return null;
  }

  return {
    rootDir: wsRootDir,
    configPath: wsConfigPath,
    config: wsConfig,
    projects,
  };
}

export function generateDefaultWorkspaceConfig(): string {
  const template: WorkspaceConfig = {
    name: 'workspace',
    projects: [
      'apps/*',
      'libs/*'
    ]
  };
  return JSON.stringify(template, null, 2) + '\n';
}

export function normalizeProjectType(type?: string): 'exe' | 'static' | 'dynamic' | 'header-only' {
  if (!type) return 'exe';
  const lower = type.toLowerCase().trim();
  if (lower === 'dynamic' || lower === 'shared' || lower === 'dll') return 'dynamic';
  if (lower === 'static' || lower === 'lib') return 'static';
  if (lower === 'header-only' || lower === 'header') return 'header-only';
  return 'exe';
}

export function normalizeProfile(profile?: string): BuildProfile | undefined {
  if (!profile) return undefined;
  const lower = profile.toLowerCase().trim();
  if (lower === 'debug' || lower === 'dbg') return 'debug';
  if (lower === 'release' || lower === 'rel') return 'release';
  if (lower === 'relwithdebinfo' || lower === 'releasewithdebinfo' || lower === 'rwdb') return 'relwithdebinfo';
  if (lower === 'minsizerel' || lower === 'minsize') return 'minsizerel';
  return undefined;
}

export function mergeConfigWithOptions(
  config: ProjectConfig | null,
  cliOptions: Partial<CompileOptions>
): CompileOptions {
  const workingDir = cliOptions.workingDir ?? process.cwd();
  const name = cliOptions.name ?? config?.name ?? path.basename(workingDir);
  const version = cliOptions.version ?? config?.version ?? '1.0.0';
  const type = normalizeProjectType(cliOptions.type ?? config?.type ?? 'exe');
  const profile = cliOptions.profile ?? normalizeProfile(config?.profile);

  const srcDir = cliOptions.srcDir ?? config?.srcDir ?? 'src';
  const includeDir = cliOptions.includeDir ?? config?.includeDir ?? 'include';
  const vendorDir = cliOptions.vendorDir ?? config?.vendorDir ?? 'vendor';
  const targetDir = cliOptions.targetDir ?? config?.targetDir ?? 'target';
  const binDir = cliOptions.binDir ?? config?.binDir ?? path.join(targetDir, 'bin');
  const objectDir = cliOptions.objectDir ?? config?.objectDir ?? path.join(targetDir, 'object');
  const libDir = cliOptions.libDir ?? config?.libDir ?? path.join(targetDir, 'lib');
  const autoDiscoverVendor = cliOptions.autoDiscoverVendor ?? config?.autoDiscoverVendor ?? true;
  const copyDlls = cliOptions.copyDlls ?? config?.copyDlls ?? true;

  const discovered = discoverProjectLayout(workingDir, {
    srcDir,
    includeDir,
    vendorDir,
    autoDiscoverVendor,
  });

  const mergedSources = [
    ...(cliOptions.sources && cliOptions.sources.length > 0
      ? cliOptions.sources
      : (config?.sources && config.sources.length > 0
          ? config.sources
          : (discovered.sourceFiles.length > 0
              ? discovered.sourceFiles
              : ['main.cpp']))),
  ];

  const mergedIncludes = [
    ...discovered.includeDirs,
    ...(config?.includeDirs ?? []),
    ...(cliOptions.includeDirs ?? []),
  ];

  const mergedLibDirs = [
    ...discovered.libDirs,
    ...(config?.libDirs ?? []),
    ...(cliOptions.libDirs ?? []),
  ];

  const mergedLibs = [
    ...discovered.libs,
    ...(config?.libs ?? []),
    ...(cliOptions.libs ?? []),
  ];

  const mergedDefines = [
    ...(config?.defines ?? []),
    ...(cliOptions.defines ?? []),
  ];

  const mergedCustomFlags = [
    ...(config?.customFlags ?? []),
    ...(cliOptions.customFlags ?? []),
  ];

  // Derive default output path if not specified
  const isWindows = process.platform === 'win32';
  let output = cliOptions.output;
  if (!output) {
    if (config?.output) {
      output = config.output;
      const outputDir = path.dirname(output).replace(/\\/g, '/');
      const outputDirLower = outputDir.toLowerCase();
      const binDirNorm = binDir.replace(/\\/g, '/').toLowerCase();
      const libDirNorm = libDir.replace(/\\/g, '/').toLowerCase();
      const isInBinDir = outputDirLower.endsWith('/bin') || outputDirLower === binDirNorm;

      if (type === 'dynamic') {
        // DLL/SO: keep in bin directory
        output = output.replace(/\.(exe|lib|a)$/i, isWindows ? '.dll' : '.so');
        if (isInBinDir && !outputDirLower.endsWith('/bin')) {
          output = path.join(binDir, path.basename(output));
        }
      } else if (type === 'static') {
        // Static lib: move to lib directory
        const ext = isWindows ? '.lib' : '.a';
        output = output.replace(/\.(exe|dll|so)$/i, ext);
        if (isInBinDir) {
          output = path.join(libDir, path.basename(output));
        }
      } else if (type === 'exe') {
        // Executable: keep in bin directory
        output = output.replace(/\.(dll|so|lib|a)$/i, isWindows ? '.exe' : '');
        if (!isInBinDir && !outputDirLower.endsWith('/bin')) {
          output = path.join(binDir, path.basename(output));
        }
      }
    } else {
      if (type === 'dynamic') {
        const ext = isWindows ? '.dll' : '.so';
        output = path.join(binDir, `${name}${ext}`);
      } else if (type === 'static') {
        const ext = isWindows ? '.lib' : '.a';
        output = path.join(libDir, `${name}${ext}`);
      } else {
        const ext = isWindows ? '.exe' : '';
        output = path.join(binDir, `${name}${ext}`);
      }
    }
  }

  return {
    name,
    version,
    type,
    sources: mergedSources,
    output,
    compiler: cliOptions.compiler ?? config?.compiler ?? 'auto',
    profile,
    std: cliOptions.std ?? config?.std ?? 'c++20',
    cStandard: cliOptions.cStandard ?? config?.cStandard,
    optimization: cliOptions.optimization ?? config?.optimization ?? 'O2',
    debug: cliOptions.debug ?? config?.debug ?? false,
    warnings: cliOptions.warnings ?? config?.warnings ?? 'default',
    warningsAsErrors: cliOptions.warningsAsErrors ?? config?.warningsAsErrors ?? false,
    srcDir,
    includeDir,
    vendorDir,
    targetDir,
    binDir,
    objectDir,
    libDir,
    autoDiscoverVendor,
    copyDlls,
    includeDirs: [...new Set(mergedIncludes)],
    libDirs: [...new Set(mergedLibDirs)],
    libs: [...new Set(mergedLibs)],
    defines: [...new Set(mergedDefines)],
    customFlags: mergedCustomFlags,
    clean: cliOptions.clean ?? false,
    parallel: cliOptions.parallel ?? config?.parallel,
    jobs: cliOptions.jobs ?? config?.jobs,
    sanitizers: cliOptions.sanitizers ?? config?.sanitizers,
    lto: cliOptions.lto ?? config?.lto,
    pch: cliOptions.pch ?? config?.pch,
    workingDir,
  };
}

export function generateDefaultConfig(): string {
  const template: ProjectConfig = {
    name: 'app',
    version: '1.0.0',
    type: 'exe',
    description: 'C++ application project',
    author: '',
    license: 'MIT',
    compiler: 'auto',
    profile: 'release',
    std: 'c++20',
    optimization: 'O2',
    debug: false,
    warnings: 'default',
    warningsAsErrors: false,
    srcDir: 'src',
    vendorDir: 'vendor',
    targetDir: 'target',
    binDir: 'target/bin',
    objectDir: 'target/object',
    libDir: 'target/lib',
    autoDiscoverVendor: true,
    copyDlls: true,
    sources: ['src/**/*.cpp'],
    output: 'target/bin/app.exe',
    includeDirs: [],
    libDirs: [],
    libs: [],
    defines: [],
    customFlags: [],
    parallel: true,
  };

  return JSON.stringify(template, null, 2) + '\n';
}
