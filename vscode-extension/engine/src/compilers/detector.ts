import { execFile, exec } from 'node:child_process';
import { promisify } from 'node:util';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import type { CompilerInfo, CompilerType } from '../types.js';

const execFileAsync = promisify(execFile);
const execAsync = promisify(exec);

export async function detectGcc(): Promise<CompilerInfo | null> {
  try {
    const { stdout } = await execFileAsync('g++', ['--version']);
    const firstLine = stdout.split('\n')[0]?.trim() || '';
    const versionMatch = firstLine.match(/(\d+\.\d+(\.\d+)?)/);
    return {
      type: 'gcc',
      name: 'GCC (g++)',
      executable: 'g++',
      version: versionMatch ? versionMatch[1] : undefined,
      available: true,
    };
  } catch {
    return null;
  }
}

export async function detectClang(): Promise<CompilerInfo | null> {
  try {
    const { stdout } = await execFileAsync('clang++', ['--version']);
    const firstLine = stdout.split('\n')[0]?.trim() || '';
    const versionMatch = firstLine.match(/clang version (\d+\.\d+(\.\d+)?)/i);
    return {
      type: 'clang',
      name: 'Clang (clang++)',
      executable: 'clang++',
      version: versionMatch ? versionMatch[1] : undefined,
      available: true,
    };
  } catch {
    return null;
  }
}

export async function findVsWherePath(): Promise<string | null> {
  const commonVsWherePaths = [
    path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Microsoft Visual Studio', 'Installer', 'vswhere.exe'),
    path.join(process.env['ProgramFiles'] || 'C:\\Program Files', 'Microsoft Visual Studio', 'Installer', 'vswhere.exe'),
  ];

  for (const p of commonVsWherePaths) {
    if (fs.existsSync(p)) {
      return p;
    }
  }

  // Also check if vswhere is in PATH
  try {
    await execFileAsync('vswhere', ['-?']);
    return 'vswhere';
  } catch {
    return null;
  }
}

export async function detectMsvc(): Promise<CompilerInfo | null> {
  if (os.platform() !== 'win32') {
    return null;
  }

  // 1. Check if cl.exe is already in PATH and working
  try {
    const { stderr, stdout } = await execFileAsync('cl', [], { encoding: 'utf8' }).catch((err) => ({
      stdout: err.stdout || '',
      stderr: err.stderr || '',
    }));
    const banner = (stdout + '\n' + stderr).trim();
    const match = banner.match(/Optimizing Compiler Version (\d+\.\d+\.\d+(\.\d+)?)/i);
    if (match) {
      return {
        type: 'msvc',
        name: 'MSVC (cl.exe in PATH)',
        executable: 'cl.exe',
        version: match[1],
        available: true,
      };
    }
  } catch {
    // Not directly in PATH, continue to search
  }

  // 2. Find Visual Studio using vswhere
  const vswhere = await findVsWherePath();
  let vsInstallationPath: string | null = null;
  let vsDisplayName: string = 'Visual Studio';

  if (vswhere) {
    try {
      const { stdout } = await execFileAsync(vswhere, [
        '-latest',
        '-products',
        '*',
        '-requires',
        'Microsoft.VisualStudio.Component.VC.Tools.x86.x64',
        '-format',
        'json',
      ]);
      const parsed = JSON.parse(stdout.trim());
      if (Array.isArray(parsed) && parsed.length > 0) {
        vsInstallationPath = parsed[0].installationPath;
        vsDisplayName = parsed[0].displayName || vsDisplayName;
      }
    } catch {
      // JSON parsing or query failed
    }
  }

  // 3. Fallback scan if vswhere didn't return an installation
  if (!vsInstallationPath) {
    const searchBases = [
      process.env['ProgramFiles'] || 'C:\\Program Files',
      process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)',
    ];

    for (const base of searchBases) {
      const vsRoot = path.join(base, 'Microsoft Visual Studio');
      if (fs.existsSync(vsRoot)) {
        try {
          const versions = fs.readdirSync(vsRoot);
          for (const ver of versions) {
            const verDir = path.join(vsRoot, ver);
            const editions = fs.readdirSync(verDir);
            for (const ed of editions) {
              const candidate = path.join(verDir, ed);
              const vcvars = path.join(candidate, 'VC', 'Auxiliary', 'Build', 'vcvars64.bat');
              if (fs.existsSync(vcvars)) {
                vsInstallationPath = candidate;
                vsDisplayName = `Visual Studio ${ver} ${ed}`;
                break;
              }
            }
            if (vsInstallationPath) break;
          }
        } catch {
          // Ignore read error
        }
      }
      if (vsInstallationPath) break;
    }
  }

  if (vsInstallationPath) {
    const vcvars64 = path.join(vsInstallationPath, 'VC', 'Auxiliary', 'Build', 'vcvars64.bat');
    const vcvarsall = path.join(vsInstallationPath, 'VC', 'Auxiliary', 'Build', 'vcvarsall.bat');
    const vcvarsPath = fs.existsSync(vcvars64) ? vcvars64 : fs.existsSync(vcvarsall) ? vcvarsall : undefined;

    if (vcvarsPath) {
      // Find the MSVC tools version directory to find cl.exe
      let clPath = 'cl.exe';
      let compilerVersion: string | undefined;

      const msvcToolsDir = path.join(vsInstallationPath, 'VC', 'Tools', 'MSVC');
      if (fs.existsSync(msvcToolsDir)) {
        try {
          const toolVersions = fs.readdirSync(msvcToolsDir).sort().reverse();
          if (toolVersions.length > 0) {
            compilerVersion = toolVersions[0];
            const candidateCl = path.join(msvcToolsDir, compilerVersion, 'bin', 'Hostx64', 'x64', 'cl.exe');
            const candidateClCase = path.join(msvcToolsDir, compilerVersion, 'bin', 'HostX64', 'x64', 'cl.exe');
            if (fs.existsSync(candidateCl)) {
              clPath = candidateCl;
            } else if (fs.existsSync(candidateClCase)) {
              clPath = candidateClCase;
            }
          }
        } catch {
          // Ignore
        }
      }

      return {
        type: 'msvc',
        name: `MSVC (${vsDisplayName})`,
        executable: clPath,
        vcvarsPath,
        version: compilerVersion,
        architecture: 'x64',
        available: true,
      };
    }
  }

  return null;
}

export async function detectAllCompilers(): Promise<CompilerInfo[]> {
  const [gcc, clang, msvc] = await Promise.all([
    detectGcc(),
    detectClang(),
    detectMsvc(),
  ]);

  const compilers: CompilerInfo[] = [];
  if (msvc) compilers.push(msvc);
  if (gcc) compilers.push(gcc);
  if (clang) compilers.push(clang);

  return compilers;
}

export async function selectCompiler(
  preference?: CompilerType | 'auto'
): Promise<CompilerInfo> {
  const allCompilers = await detectAllCompilers();

  if (allCompilers.length === 0) {
    throw new Error(
      'No supported C++ compiler detected on your system.\n' +
      'Please install Visual Studio with C++ tools, GCC (MinGW on Windows), or Clang.'
    );
  }

  if (preference && preference !== 'auto') {
    const matched = allCompilers.find((c) => c.type === preference);
    if (!matched) {
      const availableNames = allCompilers.map((c) => c.type).join(', ');
      throw new Error(
        `Requested compiler "${preference}" was not found on this system.\n` +
        `Available compilers: ${availableNames}`
      );
    }
    return matched;
  }

  // Auto selection priority:
  // On Windows, prefer MSVC if installed, then Clang, then GCC.
  // On Linux/macOS, prefer Clang, then GCC.
  if (os.platform() === 'win32') {
    const msvc = allCompilers.find((c) => c.type === 'msvc');
    if (msvc) return msvc;
    const clang = allCompilers.find((c) => c.type === 'clang');
    if (clang) return clang;
    return allCompilers[0];
  } else {
    const clang = allCompilers.find((c) => c.type === 'clang');
    if (clang) return clang;
    const gcc = allCompilers.find((c) => c.type === 'gcc');
    if (gcc) return gcc;
    return allCompilers[0];
  }
}
