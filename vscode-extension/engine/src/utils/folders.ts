import * as fs from 'node:fs';
import * as path from 'node:path';
import { walkDirectory } from './files.js';

const HEADER_EXTENSIONS = new Set(['.h', '.hpp', '.hxx', '.hh', '.inl']);
const LIB_EXTENSIONS = new Set(['.lib', '.a']);

export interface DiscoveredProjectLayout {
  sourceFiles: string[];
  includeDirs: string[];
  libDirs: string[];
  libs: string[];
  runtimeDlls: string[];
  vendorBinDirs: string[];
}

export function hasHeaderFiles(dir: string): boolean {
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    return entries.some(
      (entry) => entry.isFile() && HEADER_EXTENSIONS.has(path.extname(entry.name).toLowerCase())
    );
  } catch {
    return false;
  }
}

export function findFilesByExtension(dir: string, extensions: Set<string>, recursive: boolean = true): string[] {
  const results: string[] = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory() && recursive) {
        if (
          entry.name !== '.git' &&
          entry.name !== 'node_modules' &&
          entry.name !== 'dist' &&
          entry.name !== 'build' &&
          entry.name !== 'target'
        ) {
          results.push(...findFilesByExtension(fullPath, extensions, recursive));
        }
      } else if (entry.isFile() && extensions.has(path.extname(entry.name).toLowerCase())) {
        results.push(fullPath);
      }
    }
  } catch {
    // Ignore read error
  }
  return results;
}

export function discoverProjectLayout(
  baseDir: string = process.cwd(),
  options?: {
    srcDir?: string;
    includeDir?: string;
    vendorDir?: string;
    autoDiscoverVendor?: boolean;
  }
): DiscoveredProjectLayout {
  const srcName = options?.srcDir || 'src';
  const incName = options?.includeDir || 'include';
  const vendorName = options?.vendorDir || 'vendor';
  const autoDiscover = options?.autoDiscoverVendor !== false;

  const resolvedSrc = path.resolve(baseDir, srcName);
  const resolvedInc = path.resolve(baseDir, incName);
  const resolvedVendor = path.resolve(baseDir, vendorName);
  const resolvedLib = path.resolve(baseDir, 'lib');

  const sourceFiles: string[] = [];
  const includeDirs = new Set<string>();
  const libDirs = new Set<string>();
  const libs = new Set<string>();
  const runtimeDlls = new Set<string>();
  const vendorBinDirs = new Set<string>();

  // 1. Sources from src/
  if (fs.existsSync(resolvedSrc)) {
    sourceFiles.push(...walkDirectory(resolvedSrc));
    // Also allow includes relative to src
    includeDirs.add(resolvedSrc);
  }

  // 2. Project headers from include/ (if used)
  if (fs.existsSync(resolvedInc)) {
    includeDirs.add(resolvedInc);
  }

  // 3. Root lib folder if exists
  if (fs.existsSync(resolvedLib)) {
    libDirs.add(resolvedLib);
    const foundLibs = findFilesByExtension(resolvedLib, LIB_EXTENSIONS, true);
    for (const l of foundLibs) {
      libs.add(path.basename(l));
    }
  }

  // 4. Vendor directory auto-discovery
  if (autoDiscover && fs.existsSync(resolvedVendor)) {
    includeDirs.add(resolvedVendor);

    try {
      const vendorEntries = fs.readdirSync(resolvedVendor, { withFileTypes: true });
      for (const entry of vendorEntries) {
        if (!entry.isDirectory()) continue;

        const vendorSubDir = path.join(resolvedVendor, entry.name);
        const vendorConfigFile = path.join(vendorSubDir, 'cpp.json');
        let hasCustomManifest = false;

        // Check if vendor project has its own cpp.json manifest
        if (fs.existsSync(vendorConfigFile)) {
          try {
            const raw = fs.readFileSync(vendorConfigFile, 'utf8');
            const pkgConfig = JSON.parse(raw);
            hasCustomManifest = true;

            // 1. Vendor include directories
            if (Array.isArray(pkgConfig.includeDirs) && pkgConfig.includeDirs.length > 0) {
              for (const inc of pkgConfig.includeDirs) {
                includeDirs.add(path.resolve(vendorSubDir, inc));
              }
            } else {
              includeDirs.add(vendorSubDir);
            }

            // 2. Vendor library directories
            if (Array.isArray(pkgConfig.libDirs)) {
              for (const ld of pkgConfig.libDirs) {
                libDirs.add(path.resolve(vendorSubDir, ld));
              }
            }

            // 3. Vendor libraries to link
            if (Array.isArray(pkgConfig.libs)) {
              for (const lb of pkgConfig.libs) {
                libs.add(lb);
              }
            }

            // 4. Vendor bin directories (for DLLs)
            if (pkgConfig.binDir) {
              const fullBin = path.resolve(vendorSubDir, pkgConfig.binDir);
              if (fs.existsSync(fullBin)) {
                vendorBinDirs.add(fullBin);
              }
            }
          } catch {
            hasCustomManifest = false;
          }
        }

        // Fallback convention scanning if no manifest or additional files present
        if (!hasCustomManifest) {
          // Check for include subdirectory (vendor/<pkg>/include)
          const subInc = path.join(vendorSubDir, 'include');
          if (fs.existsSync(subInc)) {
            includeDirs.add(subInc);
          }

          // Check if vendor/<pkg> directly contains headers
          if (hasHeaderFiles(vendorSubDir)) {
            includeDirs.add(vendorSubDir);
          }

          // Check for lib directory (vendor/<pkg>/lib)
          const subLib = path.join(vendorSubDir, 'lib');
          if (fs.existsSync(subLib)) {
            libDirs.add(subLib);
            // Check architecture-specific subdirectories like x64
            const x64Lib = path.join(subLib, 'x64');
            if (fs.existsSync(x64Lib)) {
              libDirs.add(x64Lib);
            }

            const foundLibs = findFilesByExtension(subLib, LIB_EXTENSIONS, true);
            for (const l of foundLibs) {
              libs.add(path.basename(l));
            }
          }
        }

        // Check for bin directory (vendor/<pkg>/bin) containing DLLs
        const subBin = path.join(vendorSubDir, 'bin');
        if (fs.existsSync(subBin)) {
          vendorBinDirs.add(subBin);
          const dlls = findFilesByExtension(subBin, new Set(['.dll']), true);
          for (const d of dlls) {
            runtimeDlls.add(d);
          }
        }

        // Also check if .dll is in vendor/<pkg>/lib
        const vendorLibDir = path.join(vendorSubDir, 'lib');
        if (fs.existsSync(vendorLibDir)) {
          const dlls = findFilesByExtension(vendorLibDir, new Set(['.dll']), true);
          if (dlls.length > 0) {
            vendorBinDirs.add(vendorLibDir);
          }
          for (const d of dlls) {
            runtimeDlls.add(d);
          }
        }
      }
    } catch {
      // Ignore
    }
  }

  return {
    sourceFiles,
    includeDirs: Array.from(includeDirs),
    libDirs: Array.from(libDirs),
    libs: Array.from(libs),
    runtimeDlls: Array.from(runtimeDlls),
    vendorBinDirs: Array.from(vendorBinDirs),
  };
}

export function copyRuntimeDlls(dllPaths: string[], targetDir: string): string[] {
  const copied: string[] = [];

  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  for (const dllPath of dllPaths) {
    if (!fs.existsSync(dllPath)) continue;

    const fileName = path.basename(dllPath);
    const destPath = path.join(targetDir, fileName);

    let needsCopy = true;
    if (fs.existsSync(destPath)) {
      try {
        const srcStat = fs.statSync(dllPath);
        const destStat = fs.statSync(destPath);
        if (srcStat.size === destStat.size && srcStat.mtimeMs <= destStat.mtimeMs) {
          needsCopy = false;
        }
      } catch {
        needsCopy = true;
      }
    }

    if (needsCopy) {
      try {
        fs.copyFileSync(dllPath, destPath);
        copied.push(fileName);
      } catch (err) {
        console.warn(`Warning: Could not copy DLL ${fileName} to ${targetDir}:`, err);
      }
    }
  }

  return copied;
}
