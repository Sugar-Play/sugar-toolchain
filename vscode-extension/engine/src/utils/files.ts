import * as fs from 'node:fs';
import * as path from 'node:path';

const CPP_EXTENSIONS = new Set(['.cpp', '.cxx', '.cc', '.c++', '.cp']);
const C_EXTENSIONS = new Set(['.c']);
const ALL_SOURCE_EXTENSIONS = new Set([...CPP_EXTENSIONS, ...C_EXTENSIONS]);
const HEADER_EXTENSIONS = new Set(['.h', '.hpp', '.hxx', '.hh', '.inl']);

export function isCppFile(filePath: string): boolean {
  return CPP_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

export function isCFile(filePath: string): boolean {
  return C_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

export function isSourceFile(filePath: string): boolean {
  return ALL_SOURCE_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

export function isHeaderFile(filePath: string): boolean {
  return HEADER_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

export function getObjectExtension(): string {
  return process.platform === 'win32' ? '.obj' : '.o';
}

export function isSourceNewerThanObject(sourcePath: string, objectPath: string): boolean {
  if (!fs.existsSync(objectPath)) return true;
  try {
    const srcStat = fs.statSync(sourcePath);
    const objStat = fs.statSync(objectPath);
    return srcStat.mtimeMs > objStat.mtimeMs;
  } catch {
    return true;
  }
}

export function walkDirectory(dir: string): string[] {
  const results: string[] = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (
          entry.name !== 'node_modules' &&
          entry.name !== '.git' &&
          entry.name !== 'dist' &&
          entry.name !== 'build' &&
          entry.name !== 'target'
        ) {
          results.push(...walkDirectory(fullPath));
        }
      } else if (entry.isFile() && isSourceFile(entry.name)) {
        results.push(fullPath);
      }
    }
  } catch {
    // Ignore read errors
  }
  return results;
}

export function walkDirectoryAll(dir: string): string[] {
  const results: string[] = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (
          entry.name !== 'node_modules' &&
          entry.name !== '.git' &&
          entry.name !== 'dist' &&
          entry.name !== 'build' &&
          entry.name !== 'target'
        ) {
          results.push(...walkDirectoryAll(fullPath));
        }
      } else if (entry.isFile()) {
        results.push(fullPath);
      }
    }
  } catch {
    // Ignore read errors
  }
  return results;
}

export function resolveSources(sources: string[], baseDir: string = process.cwd()): string[] {
  const resolved: string[] = [];

  for (const src of sources) {
    // If contains wildcard
    if (src.includes('*')) {
      const isRecursive = src.includes('**');
      const rootDir = path.resolve(baseDir, src.split('*')[0] || '.');

      if (isRecursive) {
        const allFiles = walkDirectory(rootDir);
        resolved.push(...allFiles);
      } else {
        // Simple directory listing match
        try {
          const searchDir = path.dirname(path.resolve(baseDir, src));
          const pattern = path.basename(src);
          const regex = new RegExp('^' + pattern.replace(/\./g, '\\.').replace(/\*/g, '.*') + '$', 'i');
          if (fs.existsSync(searchDir)) {
            const files = fs.readdirSync(searchDir);
            for (const file of files) {
              if (regex.test(file) && isSourceFile(file)) {
                resolved.push(path.join(searchDir, file));
              }
            }
          }
        } catch {
          // Ignore
        }
      }
    } else {
      const fullPath = path.isAbsolute(src) ? src : path.resolve(baseDir, src);
      if (fs.existsSync(fullPath)) {
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
          resolved.push(...walkDirectory(fullPath));
        } else if (stat.isFile()) {
          resolved.push(fullPath);
        }
      } else {
        // Keep it even if missing so compiler reports the error or caller can validate
        resolved.push(fullPath);
      }
    }
  }

  return [...new Set(resolved)];
}

export function resolveOutputPath(
  output: string | undefined,
  sources: string[],
  baseDir: string = process.cwd(),
  targetDir: string = 'target'
): string {
  const isWindows = process.platform === 'win32';
  const ext = isWindows ? '.exe' : '';

  if (output) {
    let resolved = path.isAbsolute(output) ? output : path.resolve(baseDir, output);
    const hasKnownExt = /\.(exe|dll|so|lib|a|dylib)$/i.test(resolved);
    if (isWindows && !hasKnownExt) {
      resolved += '.exe';
    }
    return resolved;
  }

  // Default to target/bin/<name>.exe
  const binDir = path.join(baseDir, targetDir, 'bin');
  const firstSource = sources[0];
  if (firstSource) {
    const baseName = path.basename(firstSource, path.extname(firstSource));
    return path.join(binDir, `${baseName}${ext}`);
  }

  return path.join(binDir, `app${ext}`);
}

export function resolveObjectDir(
  objectDir: string | undefined,
  baseDir: string = process.cwd(),
  targetDir: string = 'target'
): string {
  if (objectDir) {
    return path.isAbsolute(objectDir) ? objectDir : path.resolve(baseDir, objectDir);
  }
  return path.join(baseDir, targetDir, 'object');
}

export function resolveObjectPath(
  sourcePath: string,
  objDir: string,
  sourceBaseDir: string
): string {
  const objExt = getObjectExtension();
  const rel = path.relative(sourceBaseDir, sourcePath);
  const withoutExt = rel.replace(/\.(cpp|cxx|cc|c\+\+|cp|c)$/i, '');
  return path.join(objDir, withoutExt + objExt);
}

export function cleanBuildArtifacts(outputExePath: string, objectDir?: string): void {
  const dir = path.dirname(outputExePath);
  const baseName = path.basename(outputExePath, path.extname(outputExePath));

  const artifactExtensions = ['.exe', '.obj', '.o', '.pdb', '.ilk', '.idb', '.exp', '.lib', '.a', '.dll', '.so', '.dylib'];
  for (const ext of artifactExtensions) {
    const candidate = path.join(dir, `${baseName}${ext}`);
    if (fs.existsSync(candidate)) {
      try {
        fs.unlinkSync(candidate);
      } catch {
        // Ignore
      }
    }
  }

  // Also clean objectDir
  if (objectDir && fs.existsSync(objectDir)) {
    try {
      const files = fs.readdirSync(objectDir);
      for (const file of files) {
        if (file.endsWith('.obj') || file.endsWith('.o') || file.endsWith('.pdb') || file.endsWith('.pch')) {
          fs.unlinkSync(path.join(objectDir, file));
        }
      }
    } catch {
      // Ignore
    }
  }
}
