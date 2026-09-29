import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { CompilerDriver } from './base.js';
import type { CompilerInfo, CompileOptions, CompileResult, BuildProfile } from '../types.js';
import { cleanBuildArtifacts, resolveOutputPath, resolveObjectDir, resolveSources, isSourceNewerThanObject, getObjectExtension, isCFile } from '../utils/files.js';
import { copyRuntimeDlls, discoverProjectLayout } from '../utils/folders.js';

const execFileAsync = promisify(execFile);

function applyProfile(options: CompileOptions): { optimization: string; debug: boolean } {
  const profile = options.profile;
  if (!profile) {
    return {
      optimization: options.optimization ?? 'O2',
      debug: options.debug ?? false,
    };
  }

  switch (profile) {
    case 'debug':
      return { optimization: 'O0', debug: true };
    case 'release':
      return { optimization: 'O2', debug: false };
    case 'relwithdebinfo':
      return { optimization: 'O2', debug: true };
    case 'minsizerel':
      return { optimization: 'Os', debug: false };
    default:
      return {
        optimization: options.optimization ?? 'O2',
        debug: options.debug ?? false,
      };
  }
}

export class GccClangCompilerDriver implements CompilerDriver {
  info: CompilerInfo;

  constructor(info: CompilerInfo) {
    this.info = info;
  }

  async compile(options: CompileOptions): Promise<CompileResult> {
    const startTime = Date.now();
    const workingDir = options.workingDir || process.cwd();
    const resolvedSources = resolveSources(options.sources, workingDir);

    if (resolvedSources.length === 0) {
      throw new Error(`No source files found matching: ${options.sources.join(', ')}`);
    }

    for (const src of resolvedSources) {
      if (!fs.existsSync(src)) {
        throw new Error(`Source file not found: ${src}`);
      }
    }

    const outputExe = resolveOutputPath(options.output, resolvedSources, workingDir, options.targetDir);
    const binDir = path.dirname(outputExe);
    const objDir = resolveObjectDir(options.objectDir, workingDir, options.targetDir);

    if (!fs.existsSync(binDir)) {
      fs.mkdirSync(binDir, { recursive: true });
    }
    if (!fs.existsSync(objDir)) {
      fs.mkdirSync(objDir, { recursive: true });
    }

    if (options.clean) {
      cleanBuildArtifacts(outputExe, objDir);
    }

    const profile = applyProfile(options);
    const isDynamic =
      options.type === 'dynamic' ||
      options.type === 'shared' ||
      options.type === 'dll' ||
      outputExe.toLowerCase().endsWith('.dll') ||
      outputExe.toLowerCase().endsWith('.so');

    const isStatic =
      options.type === 'static' ||
      options.type === 'lib' ||
      outputExe.toLowerCase().endsWith('.a') ||
      outputExe.toLowerCase().endsWith('.lib');

    const isHeaderOnly = options.type === 'header-only';

    if (isHeaderOnly) {
      const layout = discoverProjectLayout(workingDir, {
        srcDir: options.srcDir,
        includeDir: options.includeDir,
        vendorDir: options.vendorDir,
        autoDiscoverVendor: options.autoDiscoverVendor,
      });
      return {
        success: true,
        executablePath: outputExe,
        durationMs: Date.now() - startTime,
        compiler: this.info,
        stdout: '',
        stderr: '',
        commandExecuted: '(header-only: no compilation needed)',
        copiedDlls: [],
        vendorBinDirs: layout.vendorBinDirs,
        projectInfo: { name: options.name, version: options.version, type: options.type },
      };
    }

    // Build shared flags (standard, optimization, warnings, includes, defines)
    const sharedFlags: string[] = [];

    // C++ Standard
    switch (options.std) {
      case 'c++11':
        sharedFlags.push('-std=c++11');
        break;
      case 'c++14':
        sharedFlags.push('-std=c++14');
        break;
      case 'c++17':
        sharedFlags.push('-std=c++17');
        break;
      case 'c++20':
        sharedFlags.push('-std=c++20');
        break;
      case 'c++23':
        sharedFlags.push('-std=c++23');
        break;
      case 'c++26':
      case 'latest':
        sharedFlags.push('-std=c++2c');
        break;
      default:
        sharedFlags.push('-std=c++20');
        break;
    }

    if (options.cStandard) {
      switch (options.cStandard) {
        case 'c11': sharedFlags.push('-std=c11'); break;
        case 'c17': sharedFlags.push('-std=c17'); break;
        case 'c23': sharedFlags.push('-std=c23'); break;
        case 'c_latest': sharedFlags.push('-std=c2x'); break;
      }
    }

    switch (profile.optimization) {
      case 'O0': sharedFlags.push('-O0'); break;
      case 'O1': sharedFlags.push('-O1'); break;
      case 'O2': sharedFlags.push('-O2'); break;
      case 'O3': sharedFlags.push('-O3'); break;
      case 'Os': sharedFlags.push('-Os'); break;
      case 'Oz': sharedFlags.push('-Oz'); break;
      default: sharedFlags.push('-O2'); break;
    }

    if (profile.debug) sharedFlags.push('-g');

    switch (options.warnings) {
      case 'none': sharedFlags.push('-w'); break;
      case 'all': sharedFlags.push('-Wall', '-Wextra'); break;
      default: sharedFlags.push('-Wall'); break;
    }

    if (options.warningsAsErrors) sharedFlags.push('-Werror');

    if (options.includeDirs) {
      for (const inc of options.includeDirs) {
        const fullInc = path.isAbsolute(inc) ? inc : path.resolve(workingDir, inc);
        sharedFlags.push(`-I${fullInc}`);
      }
    }

    if (options.defines) {
      for (const def of options.defines) {
        sharedFlags.push(`-D${def}`);
      }
    }

    if (options.lto) sharedFlags.push('-flto');

    if (options.sanitizers && options.sanitizers.length > 0) {
      sharedFlags.push(`-fsanitize=${options.sanitizers.join(',')}`);
    }

    if (options.pch) {
      const pchHeader = path.isAbsolute(options.pch) ? options.pch : path.resolve(workingDir, options.pch);
      sharedFlags.push(`-include`, pchHeader);
      sharedFlags.push('-Winvalid-pch');
    }

    // Lib directories and libs (for linking)
    const linkFlags: string[] = [];
    if (options.libDirs) {
      for (const libDir of options.libDirs) {
        const fullLibDir = path.isAbsolute(libDir) ? libDir : path.resolve(workingDir, libDir);
        linkFlags.push(`-L${fullLibDir}`);
      }
    }
    if (options.libs) {
      for (const lib of options.libs) {
        if (lib.startsWith('-l')) {
          linkFlags.push(lib);
        } else {
          linkFlags.push(`-l${lib}`);
        }
      }
    }
    if (options.customFlags && options.customFlags.length > 0) {
      linkFlags.push(...options.customFlags);
    }

    // Incremental compilation: filter sources that need recompilation
    const objExt = getObjectExtension();
    const sourcesToCompile: string[] = [];
    for (const src of resolvedSources) {
      const objPath = path.join(objDir, path.basename(src, path.extname(src)) + objExt);
      if (options.clean || isSourceNewerThanObject(src, objPath)) {
        sourcesToCompile.push(src);
      }
    }

    if (sourcesToCompile.length === 0 && !isDynamic && !isStatic) {
      const durationMs = Date.now() - startTime;
      const layout = discoverProjectLayout(workingDir, {
        srcDir: options.srcDir,
        includeDir: options.includeDir,
        vendorDir: options.vendorDir,
        autoDiscoverVendor: options.autoDiscoverVendor,
      });
      return {
        success: true,
        executablePath: outputExe,
        durationMs,
        compiler: this.info,
        stdout: '',
        stderr: '',
        commandExecuted: '(incremental: all objects up to date)',
        copiedDlls: [],
        vendorBinDirs: layout.vendorBinDirs,
        projectInfo: { name: options.name, version: options.version, type: options.type },
      };
    }

    let finalStdout = '';
    let finalStderr = '';
    const commandParts: string[] = [];

    try {
      // Step 1: Compile source files to object files
      const compileArgs = [...sharedFlags, '-fPIC', '-c'];
      for (const src of sourcesToCompile) {
        const objPath = path.join(objDir, path.basename(src, path.extname(src)) + objExt);
        compileArgs.push('-c', src, '-o', objPath);
      }

      if (sourcesToCompile.length > 0) {
        commandParts.push(`${this.info.executable} ${compileArgs.join(' ')}`);
        const { stdout, stderr } = await execFileAsync(this.info.executable, compileArgs, {
          cwd: workingDir,
          maxBuffer: 20 * 1024 * 1024,
        });
        if (stdout.trim()) finalStdout += stdout.trim() + '\n';
        if (stderr.trim()) finalStderr += stderr.trim() + '\n';
      }

      // Step 2: Link (for executables and shared libraries)
      if (!isStatic) {
        const allObjs = fs
          .readdirSync(objDir)
          .filter((f) => f.endsWith(objExt))
          .map((f) => path.join(objDir, f));

        if (allObjs.length > 0) {
          const linkArgs = [...sharedFlags];
          if (isDynamic) {
            linkArgs.push('-shared');
          }
          linkArgs.push(...allObjs, '-o', outputExe, ...linkFlags);

          commandParts.push(`${this.info.executable} ${linkArgs.join(' ')}`);
          const { stdout, stderr } = await execFileAsync(this.info.executable, linkArgs, {
            cwd: workingDir,
            maxBuffer: 20 * 1024 * 1024,
          });
          if (stdout.trim()) finalStdout += stdout.trim() + '\n';
          if (stderr.trim()) finalStderr += stderr.trim() + '\n';
        }
      }

      // Step 3: Archive static library
      if (isStatic) {
        const allObjs = fs
          .readdirSync(objDir)
          .filter((f) => f.endsWith(objExt))
          .map((f) => path.join(objDir, f));

        if (allObjs.length > 0) {
          const libTargetDir = path.dirname(outputExe);
          if (!fs.existsSync(libTargetDir)) {
            fs.mkdirSync(libTargetDir, { recursive: true });
          }

          const arArgs = ['rcs', outputExe, ...allObjs];
          commandParts.push(`ar ${arArgs.join(' ')}`);
          try {
            const arResult = await execFileAsync('ar', arArgs, {
              cwd: workingDir,
              maxBuffer: 20 * 1024 * 1024,
            });
            if (arResult.stdout?.trim()) finalStdout += arResult.stdout.trim() + '\n';
            if (arResult.stderr?.trim()) finalStderr += arResult.stderr.trim() + '\n';
          } catch (arErr: any) {
            return {
              success: false,
              executablePath: outputExe,
              durationMs: Date.now() - startTime,
              compiler: this.info,
              stdout: (finalStdout + '\n' + (arErr.stdout || '')).trim(),
              stderr: (finalStderr + '\n' + (arErr.stderr || arErr.message || '')).trim(),
              commandExecuted: commandParts.join(' && '),
            };
          }
        }
      }

      const layout = discoverProjectLayout(workingDir, {
        srcDir: options.srcDir,
        includeDir: options.includeDir,
        vendorDir: options.vendorDir,
        autoDiscoverVendor: options.autoDiscoverVendor,
      });

      let copiedDlls: string[] = [];
      if (options.copyDlls === true) {
        if (layout.runtimeDlls.length > 0) {
          copiedDlls = copyRuntimeDlls(layout.runtimeDlls, binDir);
        }
      }

      return {
        success: true,
        executablePath: outputExe,
        durationMs: Date.now() - startTime,
        compiler: this.info,
        stdout: finalStdout.trim(),
        stderr: finalStderr.trim(),
        commandExecuted: commandParts.join(' && '),
        copiedDlls,
        vendorBinDirs: layout.vendorBinDirs,
        projectInfo: {
          name: options.name,
          version: options.version,
          type: options.type,
        },
      };
    } catch (err: any) {
      return {
        success: false,
        executablePath: outputExe,
        durationMs: Date.now() - startTime,
        compiler: this.info,
        stdout: (finalStdout + '\n' + (err.stdout || '')).trim(),
        stderr: (finalStderr + '\n' + (err.stderr || err.message || '')).trim(),
        commandExecuted: commandParts.join(' && '),
      };
    }
  }
}
