import * as fs from 'node:fs';
import * as path from 'node:path';
import type {
  WorkspaceInfo,
  WorkspaceProject,
  CompileOptions,
  CompileResult,
} from './types.js';
import { findProjectInWorkspace } from './config.js';
import { compile } from './index.js';
import { resolveOutputPath } from './utils/files.js';

/**
 * Topologically sort workspace projects based on their `dependsOn` declarations.
 * Throws an error if a circular dependency is detected.
 */
export function sortProjectsTopologically(
  projects: WorkspaceProject[],
  workspace: WorkspaceInfo
): WorkspaceProject[] {
  const sorted: WorkspaceProject[] = [];
  const visited = new Set<string>();
  const visiting = new Set<string>();

  function visit(p: WorkspaceProject, stack: string[]) {
    const key = p.dir;
    if (visiting.has(key)) {
      const cycle = [...stack, p.name].join(' -> ');
      throw new Error(`Circular workspace dependency detected: ${cycle}`);
    }
    if (visited.has(key)) return;

    visiting.add(key);
    stack.push(p.name);

    const deps = p.config.dependsOn || [];
    for (const depName of deps) {
      const depProject = findProjectInWorkspace(workspace, depName);
      if (!depProject) {
        throw new Error(
          `Project "${p.name}" depends on "${depName}", but "${depName}" was not found in workspace.`
        );
      }
      visit(depProject, stack);
    }

    visiting.delete(key);
    visited.add(key);
    stack.pop();
    sorted.push(p);
  }

  for (const project of projects) {
    if (!visited.has(project.dir)) {
      visit(project, []);
    }
  }

  return sorted;
}

/**
 * Resolves all direct and transitive dependencies for a given project in build order.
 */
export function getDependenciesInBuildOrder(
  project: WorkspaceProject,
  workspace: WorkspaceInfo
): WorkspaceProject[] {
  const allDeps: WorkspaceProject[] = [];
  const visited = new Set<string>();

  function collect(p: WorkspaceProject) {
    const deps = p.config.dependsOn || [];
    for (const depName of deps) {
      const depProject = findProjectInWorkspace(workspace, depName);
      if (!depProject) {
        throw new Error(
          `Project "${p.name}" depends on "${depName}", but "${depName}" was not found in workspace.`
        );
      }
      if (!visited.has(depProject.dir)) {
        visited.add(depProject.dir);
        collect(depProject);
        allDeps.push(depProject);
      }
    }
  }

  collect(project);
  return allDeps;
}

export interface DependencyInjection {
  includeDirs: string[];
  libDirs: string[];
  libs: string[];
  runtimeDlls: string[];
  vendorBinDirs: string[];
}

/**
 * Inspects a project's dependencies and generates include directories,
 * library search directories, libraries to link, and runtime DLLs.
 */
export function resolveDependencyArtifacts(
  project: WorkspaceProject,
  workspace: WorkspaceInfo
): DependencyInjection {
  const deps = getDependenciesInBuildOrder(project, workspace);
  const includeDirs: string[] = [];
  const libDirs: string[] = [];
  const libs: string[] = [];
  const runtimeDlls: string[] = [];
  const vendorBinDirs: string[] = [];

  for (const dep of deps) {
    const depDir = dep.dir;
    const depType = (dep.config.type || 'exe').toLowerCase();

    // 1. Headers / Includes from dependency
    const incCandidate = path.join(depDir, dep.config.includeDir || 'include');
    const srcCandidate = path.join(depDir, dep.config.srcDir || 'src');

    if (fs.existsSync(incCandidate)) {
      includeDirs.push(incCandidate);
    }
    if (fs.existsSync(srcCandidate)) {
      includeDirs.push(srcCandidate);
    }
    includeDirs.push(depDir);

    if (dep.config.includeDirs) {
      for (const inc of dep.config.includeDirs) {
        includeDirs.push(path.isAbsolute(inc) ? inc : path.resolve(depDir, inc));
      }
    }

    // 2. Static library dependency
    if (depType === 'static' || depType === 'lib') {
      const targetLibDir = path.resolve(depDir, dep.config.libDir || 'target/lib');
      if (fs.existsSync(targetLibDir)) {
        libDirs.push(targetLibDir);
      }

      const isWindows = process.platform === 'win32';
      const libExt = isWindows ? '.lib' : '.a';
      const baseName = dep.config.name || path.basename(depDir);

      if (dep.config.output) {
        const outBase = path.basename(dep.config.output);
        libs.push(outBase);
        const outDir = path.dirname(path.resolve(depDir, dep.config.output));
        libDirs.push(outDir);
      } else {
        libs.push(`${baseName}${libExt}`);
      }
    }

    // 3. Dynamic / Shared library dependency (DLL)
    if (depType === 'dynamic' || depType === 'shared' || depType === 'dll') {
      const isWindows = process.platform === 'win32';
      const targetLibDir = path.resolve(depDir, dep.config.libDir || 'target/lib');
      const targetBinDir = path.resolve(depDir, dep.config.binDir || 'target/bin');

      if (fs.existsSync(targetLibDir)) {
        libDirs.push(targetLibDir);
      }
      if (fs.existsSync(targetBinDir)) {
        vendorBinDirs.push(targetBinDir);
        // Find DLLs in bin dir
        try {
          const files = fs.readdirSync(targetBinDir);
          for (const file of files) {
            if (file.toLowerCase().endsWith(isWindows ? '.dll' : '.so')) {
              runtimeDlls.push(path.join(targetBinDir, file));
            }
          }
        } catch {}
      }

      const baseName = dep.config.name || path.basename(depDir);
      if (dep.config.output) {
        const outBase = path.basename(dep.config.output);
        const importLib = outBase.replace(/\.(dll|so)$/i, isWindows ? '.lib' : '');
        libs.push(importLib);
        const outDir = path.dirname(path.resolve(depDir, dep.config.output));
        libDirs.push(outDir);
      } else {
        libs.push(isWindows ? `${baseName}.lib` : baseName);
      }
    }
  }

  return {
    includeDirs: [...new Set(includeDirs)],
    libDirs: [...new Set(libDirs)],
    libs: [...new Set(libs)],
    runtimeDlls: [...new Set(runtimeDlls)],
    vendorBinDirs: [...new Set(vendorBinDirs)],
  };
}

/**
 * Builds a project and automatically ensures all of its workspace dependencies
 * are built first, injecting headers, libraries, and copying runtime DLLs.
 */
export async function buildWithDependencies(
  project: WorkspaceProject,
  workspace: WorkspaceInfo,
  baseOptions: Partial<CompileOptions> = {},
  onStep?: (p: WorkspaceProject, isDep: boolean) => void
): Promise<CompileResult> {
  // 1. Get dependencies in build order
  const deps = getDependenciesInBuildOrder(project, workspace);

  // 2. Build each dependency first (skip header-only)
  for (const dep of deps) {
    const depType = (dep.config.type || 'exe').toLowerCase();
    if (depType === 'header-only') continue;

    if (onStep) onStep(dep, true);

    const depOptions: Partial<CompileOptions> = {
      workingDir: dep.dir,
      profile: baseOptions.profile ?? dep.config.profile,
      compiler: baseOptions.compiler ?? dep.config.compiler,
      clean: baseOptions.clean,
    };

    const depResult = await compile(depOptions);
    if (!depResult.success) {
      throw new Error(`Failed to build dependency "${dep.name}":\n${depResult.stderr || depResult.stdout}`);
    }
  }

  // 3. Resolve artifacts from built dependencies
  const artifacts = resolveDependencyArtifacts(project, workspace);

  // 4. Inject into target project options
  if (onStep) onStep(project, false);

  const targetOptions: Partial<CompileOptions> = {
    ...baseOptions,
    workingDir: project.dir,
    includeDirs: [...(baseOptions.includeDirs || []), ...artifacts.includeDirs],
    libDirs: [...(baseOptions.libDirs || []), ...artifacts.libDirs],
    libs: [...(baseOptions.libs || []), ...artifacts.libs],
  };

  const result = await compile(targetOptions);

  // 5. Copy any runtime DLLs from dependencies into target's bin directory
  if (result.success && artifacts.runtimeDlls.length > 0) {
    const targetBinDir = path.dirname(result.executablePath);
    if (!fs.existsSync(targetBinDir)) {
      fs.mkdirSync(targetBinDir, { recursive: true });
    }
    const copied: string[] = result.copiedDlls || [];
    for (const dll of artifacts.runtimeDlls) {
      const dest = path.join(targetBinDir, path.basename(dll));
      try {
        fs.copyFileSync(dll, dest);
        copied.push(path.basename(dll));
      } catch {}
    }
    result.copiedDlls = [...new Set(copied)];
  }

  // Merge vendorBinDirs
  if (artifacts.vendorBinDirs.length > 0) {
    result.vendorBinDirs = [
      ...(result.vendorBinDirs || []),
      ...artifacts.vendorBinDirs,
    ];
  }

  return result;
}
