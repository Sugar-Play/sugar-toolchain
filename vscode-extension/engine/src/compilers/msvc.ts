import { execFile, exec } from 'node:child_process';
import { promisify } from 'node:util';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { CompilerDriver } from './base.js';
import type { CompilerInfo, CompileOptions, CompileResult, BuildProfile } from '../types.js';
import { cleanBuildArtifacts, resolveOutputPath, resolveObjectDir, resolveSources, isSourceNewerThanObject } from '../utils/files.js';
import { copyRuntimeDlls, discoverProjectLayout } from '../utils/folders.js';

const execFileAsync = promisify(execFile);
const execAsync = promisify(exec);

let cachedMsvcEnv: NodeJS.ProcessEnv | null = null;

export async function getMsvcEnvironment(vcvarsPath?: string): Promise<NodeJS.ProcessEnv> {
  if (cachedMsvcEnv) return cachedMsvcEnv;

  if (!vcvarsPath) {
    cachedMsvcEnv = { ...process.env };
    return cachedMsvcEnv;
  }

  try {
    const { stdout } = await execAsync(`"${vcvarsPath}" >nul && set`, {
      windowsHide: true,
      maxBuffer: 20 * 1024 * 1024,
    });

    const env: NodeJS.ProcessEnv = { ...process.env };
    for (const line of stdout.split(/\r?\n/)) {
      const idx = line.indexOf('=');
      if (idx > 0) {
        env[line.slice(0, idx)] = line.slice(idx + 1);
      }
    }
    cachedMsvcEnv = env;
    return env;
  } catch {
    console.warn('Warning: Failed to extract MSVC environment, falling back to process.env');
    cachedMsvcEnv = { ...process.env };
    return cachedMsvcEnv;
  }
}

function applyProfile(options: CompileOptions): { optimization: string; debug: boolean } {
  const profile = options.profile;
  if (!profile) {
    return { optimization: options.optimization ?? 'O2', debug: options.debug ?? false };
  }
  switch (profile) {
    case 'debug': return { optimization: 'O0', debug: true };
    case 'release': return { optimization: 'O2', debug: false };
    case 'relwithdebinfo': return { optimization: 'O2', debug: true };
    case 'minsizerel': return { optimization: 'Os', debug: false };
    default: return { optimization: options.optimization ?? 'O2', debug: options.debug ?? false };
  }
}

export class MsvcCompilerDriver implements CompilerDriver {
  info: CompilerInfo;

  constructor(info: CompilerInfo) {
    this.info = info;
  }

  async compile(options: CompileOptions): Promise<CompileResult> {
    const startTime = Date.now();
    const workingDir = options.workingDir || process.cwd();
    const resolvedSources = resolveSources(options.sources, workingDir);

    if (resolvedSources.length === 0) {
      throw new Error(`No C++ source files found matching: ${options.sources.join(', ')}`);
    }

    for (const src of resolvedSources) {
      if (!fs.existsSync(src)) {
        throw new Error(`Source file not found: ${src}`);
      }
    }

    const outputExe = resolveOutputPath(options.output, resolvedSources, workingDir, options.targetDir);
    const binDir = path.dirname(outputExe);
    const objDir = resolveObjectDir(options.objectDir, workingDir, options.targetDir);

    if (!fs.existsSync(binDir)) fs.mkdirSync(binDir, { recursive: true });
    if (!fs.existsSync(objDir)) fs.mkdirSync(objDir, { recursive: true });

    if (options.clean) cleanBuildArtifacts(outputExe, objDir);

    const profile = applyProfile(options);
    const isDynamic = options.type === 'dynamic' || options.type === 'shared' || options.type === 'dll' || outputExe.toLowerCase().endsWith('.dll');
    const isStatic = options.type === 'static' || options.type === 'lib' || outputExe.toLowerCase().endsWith('.lib');
    const isHeaderOnly = options.type === 'header-only';

    if (isHeaderOnly) {
      const layout = discoverProjectLayout(workingDir, {
        srcDir: options.srcDir, includeDir: options.includeDir,
        vendorDir: options.vendorDir, autoDiscoverVendor: options.autoDiscoverVendor,
      });
      return {
        success: true, executablePath: outputExe, durationMs: Date.now() - startTime,
        compiler: this.info, stdout: '', stderr: '', commandExecuted: '(header-only: no compilation needed)',
        copiedDlls: [], vendorBinDirs: layout.vendorBinDirs,
        projectInfo: { name: options.name, version: options.version, type: options.type },
      };
    }

    // Base compiler flags
    const baseArgs: string[] = ['/nologo', '/EHsc', '/utf-8', '/Zc:__cplusplus'];

    if (isDynamic) baseArgs.push('/LD');
    else if (isStatic) baseArgs.push('/c');

    // Parallel
    if (options.parallel !== false) {
      const jobs = options.jobs ?? (process.env.NUMBER_OF_PROCESSORS ? parseInt(process.env.NUMBER_OF_PROCESSORS) : 4);
      if (jobs > 1) baseArgs.push(`/MP${jobs}`);
    }

    // C++ Standard
    switch (options.std) {
      case 'c++11': baseArgs.push('/std:c++14'); break;
      case 'c++14': baseArgs.push('/std:c++14'); break;
      case 'c++17': baseArgs.push('/std:c++17'); break;
      case 'c++20': baseArgs.push('/std:c++20'); break;
      case 'c++23': case 'c++26': case 'latest': baseArgs.push('/std:c++latest'); break;
      default: baseArgs.push('/std:c++20'); break;
    }

    // C Standard
    if (options.cStandard) {
      switch (options.cStandard) {
        case 'c11': baseArgs.push('/std:c11'); break;
        case 'c17': baseArgs.push('/std:c17'); break;
        case 'c23': case 'c_latest': baseArgs.push('/std:clatest'); break;
      }
    }

    // Optimization
    switch (profile.optimization) {
      case 'O0': baseArgs.push('/Od'); break;
      case 'O1': case 'Os': case 'Oz': baseArgs.push('/O1'); break;
      case 'O2': baseArgs.push('/O2'); break;
      case 'O3': baseArgs.push('/Ox'); break;
      default: baseArgs.push('/O2'); break;
    }

    // Debug
    const linkerFlags: string[] = [];
    if (profile.debug) {
      baseArgs.push('/Zi');
      linkerFlags.push('/DEBUG');
    }

    // Warnings
    switch (options.warnings) {
      case 'none': baseArgs.push('/w'); break;
      case 'all': baseArgs.push('/W4'); break;
      default: baseArgs.push('/W3'); break;
    }
    if (options.warningsAsErrors) baseArgs.push('/WX');

    // Include directories
    if (options.includeDirs) {
      for (const inc of options.includeDirs) {
        baseArgs.push(`/I${path.isAbsolute(inc) ? inc : path.resolve(workingDir, inc)}`);
      }
    }

    // Defines
    if (options.defines) {
      for (const def of options.defines) baseArgs.push(`/D${def}`);
    }

    // LTO
    if (options.lto) {
      baseArgs.push('/GL');
      linkerFlags.push('/LTCG');
    }

    // Sanitizers
    if (options.sanitizers && options.sanitizers.length > 0 && options.sanitizers.includes('address')) {
      baseArgs.push('/fsanitize=address');
    }

    // Lib directories
    if (options.libDirs) {
      for (const libDir of options.libDirs) {
        linkerFlags.push(`/LIBPATH:${path.isAbsolute(libDir) ? libDir : path.resolve(workingDir, libDir)}`);
      }
    }

    // Libs
    if (options.libs) {
      for (const lib of options.libs) {
        linkerFlags.push(lib.endsWith('.lib') ? lib : `${lib}.lib`);
      }
    }

    // Import library for DLLs
    if (isDynamic && options.libDir) {
      const fullLibDir = path.isAbsolute(options.libDir) ? options.libDir : path.resolve(workingDir, options.libDir);
      if (!fs.existsSync(fullLibDir)) fs.mkdirSync(fullLibDir, { recursive: true });
      const baseName = path.basename(outputExe, path.extname(outputExe));
      linkerFlags.push(`/IMPLIB:${path.join(fullLibDir, `${baseName}.lib`)}`);
    }

    // Object dir
    const formattedObjDir = path.isAbsolute(objDir) ? objDir : path.resolve(workingDir, objDir);

    // Route compiler intermediate PDB (vcXXX.pdb) into target/object/ so it does not clutter project root
    if (profile.debug) {
      baseArgs.push(`/Fd:${formattedObjDir}${path.sep}`);
    }

    // Incremental compilation
    const sourcesToCompile: string[] = [];
    for (const src of resolvedSources) {
      const objPath = path.join(formattedObjDir, path.basename(src, path.extname(src)) + '.obj');
      if (options.clean || isSourceNewerThanObject(src, objPath)) {
        sourcesToCompile.push(src);
      }
    }

    if (sourcesToCompile.length === 0 && !isDynamic && !isStatic) {
      const layout = discoverProjectLayout(workingDir, {
        srcDir: options.srcDir, includeDir: options.includeDir,
        vendorDir: options.vendorDir, autoDiscoverVendor: options.autoDiscoverVendor,
      });
      return {
        success: true, executablePath: outputExe, durationMs: Date.now() - startTime,
        compiler: this.info, stdout: '', stderr: '', commandExecuted: '(incremental: all objects up to date)',
        copiedDlls: [], vendorBinDirs: layout.vendorBinDirs,
        projectInfo: { name: options.name, version: options.version, type: options.type },
      };
    }

    const msvcEnv = await getMsvcEnvironment(this.info.vcvarsPath);
    let finalStdout = '';
    let finalStderr = '';
    const commandParts: string[] = [];

    try {
      // PCH setup
      let pchHeader = '';
      let pchFile = '';
      if (options.pch) {
        pchHeader = path.isAbsolute(options.pch) ? options.pch : path.resolve(workingDir, options.pch);
        if (fs.existsSync(pchHeader)) {
          pchFile = path.join(formattedObjDir, 'vc_pch.pch');
        } else {
          pchHeader = '';
        }
      }

      if (isStatic) {
        // Static: compile all sources with /c, then archive
        for (const src of sourcesToCompile) {
          const compileArgs = [...baseArgs, '/c'];
          if (pchHeader) {
            compileArgs.push(`/Yu${pchHeader}`, `/Fp${pchFile}`);
          }
          compileArgs.push(`/Fo:${path.join(formattedObjDir, path.basename(src, path.extname(src)) + '.obj')}`, src);
          commandParts.push(`${this.info.executable} ${compileArgs.join(' ')}`);
          const { stdout, stderr } = await execFileAsync(this.info.executable, compileArgs, {
            cwd: workingDir, env: msvcEnv, windowsHide: true, maxBuffer: 20 * 1024 * 1024,
          });
          if (stdout.trim()) finalStdout += stdout.trim() + '\n';
          if (stderr.trim()) finalStderr += stderr.trim() + '\n';
        }

        // Archive with lib.exe
        const objFiles = fs.readdirSync(formattedObjDir)
          .filter((f) => f.endsWith('.obj'))
          .map((f) => path.join(formattedObjDir, f));

        if (objFiles.length > 0) {
          const libTool = path.join(path.dirname(this.info.executable), 'lib.exe');
          const libTargetDir = path.dirname(outputExe);
          if (!fs.existsSync(libTargetDir)) fs.mkdirSync(libTargetDir, { recursive: true });

          const libArgs = ['/nologo', ...objFiles, `/OUT:${outputExe}`];
          commandParts.push(`lib ${libArgs.join(' ')}`);
          const libResult = await execFileAsync(
            fs.existsSync(libTool) ? libTool : 'lib.exe', libArgs,
            { cwd: workingDir, env: msvcEnv, windowsHide: true, maxBuffer: 20 * 1024 * 1024 }
          );
          if (libResult.stdout?.trim()) finalStdout += libResult.stdout.trim() + '\n';
          if (libResult.stderr?.trim()) finalStderr += libResult.stderr.trim() + '\n';
        }
      } else {
        // Executable or DLL: compile + link
        const compileArgs = [...baseArgs];
        compileArgs.push(`/Fe:${outputExe}`);
        compileArgs.push(`/Fo:${formattedObjDir}${path.sep}`);

        if (pchHeader && sourcesToCompile.length > 0) {
          // Create PCH from first source
          const pchArgs = [...compileArgs, `/Yc${pchHeader}`, `/Fp${pchFile}`, sourcesToCompile[0]];
          commandParts.push(`${this.info.executable} ${pchArgs.join(' ')}`);
          const { stdout: s1, stderr: e1 } = await execFileAsync(this.info.executable, pchArgs, {
            cwd: workingDir, env: msvcEnv, windowsHide: true, maxBuffer: 20 * 1024 * 1024,
          });
          if (s1.trim()) finalStdout += s1.trim() + '\n';
          if (e1.trim()) finalStderr += e1.trim() + '\n';

          // Use PCH for remaining sources
          if (sourcesToCompile.length > 1) {
            const useArgs = [...compileArgs, `/Yu${pchHeader}`, `/Fp${pchFile}`, ...sourcesToCompile.slice(1)];
            useArgs.push('/link', ...linkerFlags);
            commandParts.push(`${this.info.executable} ${useArgs.join(' ')}`);
            const { stdout: s2, stderr: e2 } = await execFileAsync(this.info.executable, useArgs, {
              cwd: workingDir, env: msvcEnv, windowsHide: true, maxBuffer: 20 * 1024 * 1024,
            });
            if (s2.trim()) finalStdout += s2.trim() + '\n';
            if (e2.trim()) finalStderr += e2.trim() + '\n';
          }
        } else {
          // No PCH
          compileArgs.push(...sourcesToCompile);
          compileArgs.push('/link', ...linkerFlags);
          commandParts.push(`${this.info.executable} ${compileArgs.join(' ')}`);
          const { stdout, stderr } = await execFileAsync(this.info.executable, compileArgs, {
            cwd: workingDir, env: msvcEnv, windowsHide: true, maxBuffer: 20 * 1024 * 1024,
          });
          if (stdout.trim()) finalStdout += stdout.trim() + '\n';
          if (stderr.trim()) finalStderr += stderr.trim() + '\n';
        }
      }

      const layout = discoverProjectLayout(workingDir, {
        srcDir: options.srcDir, includeDir: options.includeDir,
        vendorDir: options.vendorDir, autoDiscoverVendor: options.autoDiscoverVendor,
      });

      let copiedDlls: string[] = [];
      if (options.copyDlls === true && layout.runtimeDlls.length > 0) {
        copiedDlls = copyRuntimeDlls(layout.runtimeDlls, binDir);
      }

      return {
        success: true, executablePath: outputExe, durationMs: Date.now() - startTime,
        compiler: this.info, stdout: finalStdout.trim(), stderr: finalStderr.trim(),
        commandExecuted: commandParts.join(' && '), copiedDlls, vendorBinDirs: layout.vendorBinDirs,
        projectInfo: { name: options.name, version: options.version, type: options.type },
      };
    } catch (err: any) {
      return {
        success: false, executablePath: outputExe, durationMs: Date.now() - startTime,
        compiler: this.info, stdout: (err.stdout || '').trim(), stderr: (err.stderr || err.message || '').trim(),
        commandExecuted: commandParts.join(' && '),
      };
    }
  }
}
