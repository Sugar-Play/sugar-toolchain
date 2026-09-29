#!/usr/bin/env node

import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  compile,
  compileAndRun,
  runExecutable,
  detectAllCompilers,
  selectCompiler,
  generateDefaultConfig,
  generateDefaultWorkspaceConfig,
  findConfigFile,
  loadConfigFile,
  discoverWorkspace,
  findProjectInWorkspace,
  sortProjectsTopologically,
  buildWithDependencies,
  packageProject,
  CONFIG_FILE_NAME,
  WORKSPACE_FILE_NAME,
  badges,
  colors,
  formatDuration,
  logCompilerOutput,
  FileWatcher,
  promptSelect,
  type CompileOptions,
  type CompileResult,
  type CompilerType,
  type CppStandard,
  type OptimizationLevel,
  type BuildProfile,
  type ProjectType,
  type SanitizerKind,
  type WorkspaceInfo,
  type WorkspaceProject,
} from './src/index.js';

const PROFILES = [
  { label: 'Release', value: 'release' as BuildProfile, description: '-O2 optimized, no debug symbols' },
  { label: 'Debug', value: 'debug' as BuildProfile, description: '-O0 -g debug symbols, no optimization' },
  { label: 'RelWithDebInfo', value: 'relwithdebinfo' as BuildProfile, description: '-O2 -g optimized with debug symbols' },
  { label: 'MinSizeRel', value: 'minsizerel' as BuildProfile, description: '-Os minimum size optimized' },
];

const BUILD_TYPES = [
  { label: 'Executable (.exe)', value: 'exe' as ProjectType, description: 'Standard executable application' },
  { label: 'Static Library (.lib/.a)', value: 'static' as ProjectType, description: 'Statically linked library' },
  { label: 'Dynamic Library (.dll/.so)', value: 'dynamic' as ProjectType, description: 'Shared dynamic library' },
  { label: 'Header-Only', value: 'header-only' as ProjectType, description: 'No compilation needed' },
];

const HELP_TEXT = `
${colors.bold(colors.magenta('Sugar++'))} ${colors.gray('(spp / s++)')} - The Sweet, Zero-Config C++ Build Engine

${colors.bold('USAGE:')}
  ${colors.green('spp')} [command] [sources...] [options] [-- <program-arguments>]
  ${colors.green('s++')} [command] [sources...] [options] [-- <program-arguments>]

${colors.bold('COMMANDS:')}
  ${colors.cyan('build')} [sources...]       Compile source files (default command)
  ${colors.cyan('run')}   [sources...]       Compile and immediately run the binary
  ${colors.cyan('package')}, ${colors.cyan('dist')}       Bundle executable, runtime DLLs & assets into dist/
  ${colors.cyan('test')}  [sources...]       Compile and run tests (GoogleTest/Catch2/doctest)
  ${colors.cyan('watch')} [sources...]       Watch files and recompile (and rerun) on change
  ${colors.cyan('workspace')}                Build all projects in a workspace
  ${colors.cyan('list-compilers')}           Show all detected C++ compilers on this machine
  ${colors.cyan('init')}                     Create a starter cpp.json (or --workspace for workspace.json)
  ${colors.cyan('help')}, ${colors.cyan('--help')}, ${colors.cyan('-h')}     Show this help guide
  ${colors.cyan('--version')}, ${colors.cyan('-v')}          Show CLI version

${colors.bold('OPTIONS:')}
  ${colors.yellow('-o, --out <path>')}         Output executable file path (e.g. target/bin/app.exe)
  ${colors.yellow('-P, --project <name>')}     Target a specific project in a workspace
  ${colors.yellow('--zip')}                    Create a compressed .zip archive of the package
  ${colors.yellow('--dist-dir <dir>')}         Output directory for packages (default: dist)
  ${colors.yellow('--dll, --shared')}          Build as dynamic shared library (.dll / .so)
  ${colors.yellow('--static')}                 Build as static library (.lib / .a)
  ${colors.yellow('-t, --target <dir>')}       Target output root directory (default: target)
  ${colors.yellow('--objdir <dir>')}           Directory for intermediate object files (default: target/object)
  ${colors.yellow('--bindir <dir>')}           Directory for final binaries & DLLs (default: target/bin)
  ${colors.yellow('-c, --compiler <name>')}    Force compiler: auto | msvc | gcc | clang
  ${colors.yellow('-s, --std <standard>')}     C++ standard: c++11 | c++14 | c++17 | c++20 | c++23 | latest
  ${colors.yellow('--c-std <standard>')}       C standard: c11 | c17 | c23 (for mixed C/C++ projects)
  ${colors.yellow('-p, --profile <name>')}     Build profile: debug | release | relwithdebinfo | minsizerel
  ${colors.yellow('-O, --opt <level>')}        Optimization: O0 | O1 | O2 | O3 | Os | Oz (default: O2)
  ${colors.yellow('-g, --debug')}              Include debug symbols (PDB for MSVC / DWARF for GCC)
  ${colors.yellow('-W, --warnings <level>')}   Warning level: default | all | none
  ${colors.yellow('-Werror')}                  Treat compiler warnings as errors
  ${colors.yellow('-I, --include <dir>')}      Add include directory (can be used multiple times)
  ${colors.yellow('-L, --libdir <dir>')}       Add library search directory (can be used multiple times)
  ${colors.yellow('-l, --lib <name>')}         Link library (e.g. ws2_32, pthread)
  ${colors.yellow('-D, --define <name>')}      Define preprocessor macro (can be used multiple times)
  ${colors.yellow('-a, --args <string>')}      Arguments to pass to program when running
  ${colors.yellow('--clean')}                  Delete previous build artifacts before compiling
  ${colors.yellow('--verbose')}                Print full compiler command and internal details
  ${colors.yellow('--parallel, -j[N]')}        Enable parallel compilation (default: auto-detect cores)
  ${colors.yellow('--no-parallel')}            Disable parallel compilation
  ${colors.yellow('--sanitize <kinds>')}       Sanitizers: address,undefined,thread,memory,leak (comma-separated)
  ${colors.yellow('--lto')}                   Enable Link-Time Optimization
  ${colors.yellow('--pch <header>')}           Use precompiled header
  ${colors.yellow('-i, --interactive, --menu')} Force interactive selection menu

${colors.bold('TEST COMMAND:')}
  ${colors.yellow('--filter <expr>')}          Test filter expression (e.g. "*MathTest*")
  ${colors.yellow('--framework <name>')}       Test framework: auto | gtest | catch2 | doctest
  ${colors.yellow('--no-rebuild')}             Skip recompilation before running tests

${colors.bold('BUILD PROFILES:')}
  ${colors.cyan('debug')}               -O0 -g (debug symbols, no optimization)
  ${colors.cyan('release')}             -O2 (optimized, no debug)
  ${colors.cyan('relwithdebinfo')}      -O2 -g (optimized with debug symbols)
  ${colors.cyan('minsizerel')}          -Os (minimum size optimized)

${colors.bold('EXAMPLES:')}
  ${colors.gray('# Interactive build (shows project & config picker)')}
  ${colors.green('spp build')}

  ${colors.gray('# Skip menu, build release directly')}
  ${colors.green('spp build --profile release')}

  ${colors.gray('# Build specific project in a workspace')}
  ${colors.green('spp build --project game')}

  ${colors.gray('# Build all workspace projects')}
  ${colors.green('spp workspace')}

  ${colors.gray('# Compile and run with C++20')}
  ${colors.green('spp run main.cpp --std c++20')}

  ${colors.gray('# Compile as static library')}
  ${colors.green('spp build --static')}

  ${colors.gray('# Package project for distribution')}
  ${colors.green('spp package --zip')}

  ${colors.gray('# Run tests')}
  ${colors.green('spp test')}

  ${colors.gray('# Watch source files and automatically re-run on save')}
  ${colors.green('spp watch main.cpp --run')}
`;

interface ParsedArgs {
  command: 'build' | 'run' | 'package' | 'test' | 'watch' | 'workspace' | 'list-compilers' | 'init' | 'help' | 'version';
  sources: string[];
  programArgs: string[];
  options: Partial<CompileOptions>;
  watchRun: boolean;
  verbose: boolean;
  testFilter?: string;
  testFramework?: 'gtest' | 'catch2' | 'doctest' | 'auto';
  testRebuild: boolean;
  projectName?: string;
  packageZip?: boolean;
  distDir?: string;
  interactive?: boolean;
}

function parseArgs(rawArgs: string[]): ParsedArgs {
  const separatorIndex = rawArgs.indexOf('--');
  let cliArgs = rawArgs;
  let programArgs: string[] = [];

  if (separatorIndex !== -1) {
    cliArgs = rawArgs.slice(0, separatorIndex);
    programArgs = rawArgs.slice(separatorIndex + 1);
  }

  let command: ParsedArgs['command'] = 'build';
  const sources: string[] = [];
  const options: Partial<CompileOptions> = {
    includeDirs: [],
    libDirs: [],
    libs: [],
    defines: [],
    customFlags: [],
  };
  let watchRun = false;
  let verbose = false;
  let testFilter: string | undefined;
  let testFramework: 'gtest' | 'catch2' | 'doctest' | 'auto' | undefined;
  let testRebuild = true;
  let projectName: string | undefined;
  let packageZip = false;
  let distDir: string | undefined;
  let interactive = false;

  let i = 0;
  if (cliArgs.length > 0) {
    const first = cliArgs[0].toLowerCase();
    if (['build', 'run', 'package', 'dist', 'test', 'watch', 'workspace', 'list-compilers', 'init', 'help'].includes(first)) {
      command = (first === 'dist' ? 'package' : first) as any;
      i = 1;
    } else if (first === '--help' || first === '-h') {
      command = 'help';
      i = 1;
    } else if (first === '--version' || first === '-v') {
      command = 'version';
      i = 1;
    }
  }

  for (; i < cliArgs.length; i++) {
    const arg = cliArgs[i];

    const nextVal = (): string => {
      if (i + 1 < cliArgs.length) return cliArgs[++i];
      console.error(`${badges.error} Flag ${colors.yellow(arg)} requires a value`);
      process.exit(1);
      return ''; // unreachable, but satisfies TypeScript
    };

    if (arg === '--help' || arg === '-h') {
      command = 'help';
    } else if (arg === '--version' || arg === '-v') {
      command = 'version';
    } else if (arg === '--verbose') {
      verbose = true;
    } else if (arg === '--run') {
      watchRun = true;
    } else if (arg === '--clean') {
      options.clean = true;
    } else if (arg === '-g' || arg === '--debug') {
      options.debug = true;
    } else if (arg === '-Werror') {
      options.warningsAsErrors = true;
    } else if (arg === '--dll' || arg === '--shared') {
      options.type = 'shared';
    } else if (arg === '--static') {
      options.type = 'static';
    } else if (arg === '--exe') {
      options.type = 'executable';
    } else if (arg === '--parallel' || arg === '-j') {
      if (arg === '-j' && i + 1 < cliArgs.length && /^\d+$/.test(cliArgs[i + 1])) {
        options.jobs = parseInt(cliArgs[++i]);
      } else {
        options.parallel = true;
      }
    } else if (arg === '--no-parallel') {
      options.parallel = false;
    } else if (arg === '--lto') {
      options.lto = true;
    } else if (arg === '--pch') {
      options.pch = nextVal();
    } else if (arg === '--sanitize') {
      options.sanitizers = nextVal().split(',').map((s) => s.trim()) as SanitizerKind[];
    } else if (arg === '--filter') {
      testFilter = nextVal();
    } else if (arg === '--framework') {
      testFramework = nextVal() as any;
    } else if (arg === '--no-rebuild') {
      testRebuild = false;
    } else if (arg === '-o' || arg === '--out') {
      options.output = nextVal();
    } else if (arg === '-t' || arg === '--target') {
      options.targetDir = nextVal();
    } else if (arg === '--objdir') {
      options.objectDir = nextVal();
    } else if (arg === '--bindir') {
      options.binDir = nextVal();
    } else if (arg === '-c' || arg === '--compiler') {
      options.compiler = nextVal() as CompilerType;
    } else if (arg === '-s' || arg === '--std') {
      options.std = nextVal() as CppStandard;
    } else if (arg === '--c-std') {
      options.cStandard = nextVal() as any;
    } else if (arg === '-p' || arg === '--profile') {
      options.profile = nextVal() as BuildProfile;
    } else if (arg === '-O' || arg === '--opt') {
      options.optimization = nextVal() as OptimizationLevel;
    } else if (arg === '-W' || arg === '--warnings') {
      options.warnings = nextVal() as any;
    } else if (arg === '-I' || arg === '--include') {
      options.includeDirs?.push(nextVal());
    } else if (arg === '-L' || arg === '--libdir') {
      options.libDirs?.push(nextVal());
    } else if (arg === '-l' || arg === '--lib') {
      options.libs?.push(nextVal());
    } else if (arg === '-D' || arg === '--define') {
      options.defines?.push(nextVal());
    } else if (arg === '-a' || arg === '--args') {
      const argVal = nextVal();
      if (argVal) {
        programArgs.push(...argVal.split(/\s+/).filter(Boolean));
      }
    } else if (arg === '-P' || arg === '--project') {
      projectName = nextVal();
    } else if (arg === '--zip') {
      packageZip = true;
    } else if (arg === '--dist-dir') {
      distDir = nextVal();
    } else if (arg === '-i' || arg === '--interactive' || arg === '--menu') {
      interactive = true;
    } else if (arg.startsWith('-I') && arg.length > 2) {
      options.includeDirs?.push(arg.slice(2));
    } else if (arg.startsWith('-D') && arg.length > 2) {
      options.defines?.push(arg.slice(2));
    } else if (arg.startsWith('-L') && arg.length > 2) {
      options.libDirs?.push(arg.slice(2));
    } else if (arg.startsWith('-l') && arg.length > 2 && arg[2] !== '-') {
      options.libs?.push(arg.slice(2));
    } else if (arg.startsWith('-')) {
      options.customFlags?.push(arg);
    } else {
      sources.push(arg);
    }
  }

  if (sources.length > 0) {
    options.sources = sources;
  }

  return { command, sources, programArgs, options, watchRun, verbose, testFilter, testFramework, testRebuild, projectName, packageZip, distDir, interactive };
}

async function showBuildMenu(parsed: ParsedArgs): Promise<boolean> {
  if (!process.stdin.isTTY) return false;

  const workingDir = parsed.options.workingDir || process.cwd();
  const workspace = discoverWorkspace(workingDir);

  // --- WORKSPACE MODE: show project picker ---
  if (workspace && workspace.projects.length > 0 && !parsed.projectName) {
    try {
      console.log();

      // Step 1: Pick project
      const projectOptions: { label: string; value: string; description: string }[] = [];

      if (parsed.command === 'build' && workspace.projects.length > 1) {
        projectOptions.push({
          label: `${colors.bold('[All Projects]')}  ${colors.gray(`(${workspace.projects.length} targets)`)}`,
          value: '__ALL__',
          description: 'Build all projects in workspace',
        });
      }

      for (const p of workspace.projects) {
        const tag = p.isRoot ? colors.cyan('[root]') : colors.gray(`[${p.relDir}]`);
        projectOptions.push({
          label: `${colors.bold(p.name)}  ${colors.gray(`(${p.config.type || 'exe'})`)}  ${tag}`,
          value: p.name,
          description: p.config.description || `Location: ${p.relDir}`,
        });
      }

      const selectedValue = await promptSelect({
        title: 'Select Project',
        options: projectOptions,
        defaultIndex: 0,
      });

      if (selectedValue === '__ALL__') {
        console.log(`  ${colors.green('✓')} ${colors.bold('All Projects')}\n`);
        if (parsed.options.profile === undefined) {
          const profile = await promptSelect({
            title: 'Build Configuration',
            options: PROFILES,
            defaultIndex: 0,
          });
          parsed.options.profile = profile as BuildProfile;
          console.log(`  ${colors.green('✓')} ${colors.bold(PROFILES.find((p) => p.value === profile)?.label ?? profile)}\n`);
        }
        await handleWorkspace(parsed);
        return true;
      }

      const project = findProjectInWorkspace(workspace, selectedValue)!;
      parsed.projectName = project.name;
      parsed.options.workingDir = project.dir;
      parsed.options.type = project.config.type as ProjectType;
      parsed.options.std = project.config.std as CppStandard;

      console.log(`  ${colors.green('✓')} ${colors.bold(project.name)} ${colors.gray(`(${project.relDir})`)}\n`);

      // Step 2: Pick build profile (if not already set)
      if (parsed.options.profile === undefined && project.config.profile === undefined) {
        const profile = await promptSelect({
          title: 'Build Configuration',
          options: PROFILES,
          defaultIndex: 0,
        });
        parsed.options.profile = profile as BuildProfile;
        console.log(`  ${colors.green('✓')} ${colors.bold(PROFILES.find((p) => p.value === profile)?.label ?? profile)}\n`);
      }
    } catch (err: any) {
      if (err.message === 'cancelled') {
        console.log(`\n${badges.warn} Build cancelled.`);
        process.exit(0);
      }
      throw err;
    }
    return false;
  }

  // --- SINGLE PROJECT MODE: just pick profile ---
  const configFile = findConfigFile(workingDir);
  const fileConfig = configFile ? loadConfigFile(configFile) : null;

  const hasProfile = (parsed.options.profile !== undefined || fileConfig?.profile !== undefined) && !parsed.interactive;
  if (hasProfile) return false;

  try {
    console.log();
    const profile = await promptSelect({
      title: 'Build Configuration',
      options: PROFILES,
      defaultIndex: 0,
    });
    parsed.options.profile = profile as BuildProfile;
    console.log(`  ${colors.green('✓')} ${colors.bold(PROFILES.find((p) => p.value === profile)?.label ?? profile)}`);
    console.log();
  } catch (err: any) {
    if (err.message === 'cancelled') {
      console.log(`\n${badges.warn} Build cancelled.`);
      process.exit(0);
    }
    throw err;
  }
  return false;
}

async function handleListCompilers(): Promise<void> {
  console.log(`${badges.cppc} Detecting available C++ compilers...`);
  const compilers = await detectAllCompilers();

  if (compilers.length === 0) {
    console.log(`${badges.warn} No C++ compilers found in system.`);
    return;
  }

  const defaultCompiler = await selectCompiler('auto');

  console.log(`\nFound ${colors.bold(String(compilers.length))} compiler(s):`);
  for (const c of compilers) {
    const isDefault = c.type === defaultCompiler.type;
    const defaultTag = isDefault ? colors.green(' (Selected Default)') : '';
    console.log(`  ${colors.bold(colors.cyan('•'))} ${colors.bold(c.name)}${defaultTag}`);
    console.log(`    Type:       ${c.type}`);
    console.log(`    Executable: ${c.executable}`);
    if (c.version) console.log(`    Version:    ${c.version}`);
    if (c.vcvarsPath) console.log(`    vcvars:     ${c.vcvarsPath}`);
    console.log();
  }
}

async function handleInit(parsed: ParsedArgs): Promise<void> {
  const isWorkspace = process.argv.includes('--workspace') || process.argv.includes('-w');
  if (isWorkspace) {
    const targetPath = path.join(process.cwd(), WORKSPACE_FILE_NAME);
    if (fs.existsSync(targetPath)) {
      console.log(`${badges.warn} ${WORKSPACE_FILE_NAME} already exists in current directory.`);
      return;
    }
    fs.writeFileSync(targetPath, generateDefaultWorkspaceConfig(), 'utf8');
    console.log(`${badges.success} Created ${colors.bold(WORKSPACE_FILE_NAME)}!`);
    return;
  }

  const targetPath = path.join(process.cwd(), CONFIG_FILE_NAME);
  if (fs.existsSync(targetPath)) {
    console.log(`${badges.warn} ${CONFIG_FILE_NAME} already exists in current directory.`);
    return;
  }

  fs.writeFileSync(targetPath, generateDefaultConfig(), 'utf8');
  console.log(`${badges.success} Created ${colors.bold(CONFIG_FILE_NAME)}!`);
}

async function handleWorkspace(parsed: ParsedArgs): Promise<void> {
  const workspace = discoverWorkspace(parsed.options.workingDir || process.cwd());
  if (!workspace) {
    console.log(`${badges.warn} No workspace found. Create a ${colors.yellow(WORKSPACE_FILE_NAME)} with ${colors.yellow('"projects": [...]')}.`);
    return;
  }

  console.log(`${badges.cppc} Workspace: ${colors.bold(workspace.config.name || path.basename(workspace.rootDir))}`);
  console.log(`  Found ${colors.cyan(String(workspace.projects.length))} project(s)\n`);

  const projectFilter = parsed.projectName;
  let projectsToBuild = workspace.projects;
  if (projectFilter) {
    const found = findProjectInWorkspace(workspace, projectFilter);
    if (found) {
      projectsToBuild = [found];
    } else {
      console.log(`${badges.warn} Project "${colors.yellow(projectFilter)}" not found in workspace.`);
      console.log(`  Available projects:`);
      for (const p of workspace.projects) {
        console.log(`    - ${colors.cyan(p.name)} (${p.relDir})`);
      }
      return;
    }
  }

  let allSuccess = true;
  const startTime = Date.now();

  let sortedProjects: WorkspaceProject[];
  try {
    sortedProjects = sortProjectsTopologically(projectsToBuild, workspace);
  } catch (err: any) {
    console.error(`${badges.error} ${err.message}`);
    process.exit(1);
  }

  for (const project of sortedProjects) {
    const projectType = project.config.type || 'exe';
    const isHeaderOnly = projectType === 'header-only';
    const loc = project.isRoot ? colors.cyan('[root]') : colors.gray(`[${project.relDir}]`);

    if (isHeaderOnly) {
      console.log(`${colors.bold(colors.cyan('▸'))} ${colors.bold(project.name)} (${colors.green('header-only')}) ${loc} ${colors.gray('— skipped, no compilation needed')}`);
      continue;
    }

    console.log(`${colors.bold(colors.cyan('▸'))} ${colors.bold(project.name)} (${projectType}) ${loc}`);

    const projectOptions: Partial<CompileOptions> = {
      ...parsed.options,
      workingDir: project.dir,
      name: project.name,
      type: project.config.type,
      sources: project.config.sources,
      output: project.config.output,
      std: project.config.std,
      profile: parsed.options.profile ?? project.config.profile,
      compiler: project.config.compiler,
      srcDir: project.config.srcDir,
      vendorDir: project.config.vendorDir,
      targetDir: project.config.targetDir,
      includeDirs: project.config.includeDirs,
      libDirs: project.config.libDirs,
      libs: project.config.libs,
      defines: project.config.defines,
      customFlags: project.config.customFlags,
      parallel: project.config.parallel,
      jobs: project.config.jobs,
      lto: project.config.lto,
      pch: project.config.pch,
      copyDlls: project.config.copyDlls,
      autoDiscoverVendor: project.config.autoDiscoverVendor,
    };

    try {
      let result: CompileResult;
      if (project.config.dependsOn && project.config.dependsOn.length > 0) {
        result = await buildWithDependencies(project, workspace, projectOptions);
      } else {
        result = await compile(projectOptions);
      }

      if (parsed.verbose) {
        console.log(`  ${badges.info} Command: ${colors.gray(result.commandExecuted)}`);
      }

      logCompilerOutput(result.stdout, result.stderr);

      if (result.success) {
        console.log(`  ${badges.success} Built ${colors.green(formatDuration(result.durationMs))}\n`);
      } else {
        allSuccess = false;
        console.error(`  ${badges.error} Build failed\n`);
      }
    } catch (err: any) {
      allSuccess = false;
      console.error(`  ${badges.error} ${err.message}\n`);
    }
  }

  const totalDuration = Date.now() - startTime;
  if (allSuccess) {
    console.log(`${badges.success} All ${colors.cyan(String(projectsToBuild.length))} project(s) built in ${colors.green(formatDuration(totalDuration))}`);
  } else {
    console.error(`${badges.error} Some projects failed to build`);
    process.exit(1);
  }
}

async function buildCurrentTarget(parsed: ParsedArgs): Promise<CompileResult> {
  const workingDir = parsed.options.workingDir || process.cwd();
  const workspace = discoverWorkspace(workingDir);
  let targetProject: WorkspaceProject | undefined;

  if (workspace) {
    if (parsed.projectName) {
      targetProject = findProjectInWorkspace(workspace, parsed.projectName);
    } else {
      targetProject = workspace.projects.find((p) => p.dir === path.resolve(workingDir));
    }
  }

  if (targetProject && workspace && targetProject.config.dependsOn && targetProject.config.dependsOn.length > 0) {
    return buildWithDependencies(targetProject, workspace, parsed.options, (p, isDep) => {
      if (isDep) {
        console.log(`  ${colors.bold(colors.cyan('▸'))} Building dependency: ${colors.bold(p.name)} (${p.config.type || 'static'})`);
      }
    });
  }

  return compile(parsed.options);
}

async function handleBuild(parsed: ParsedArgs): Promise<boolean> {
  console.log(`${badges.cppc} Compiling...`);
  const result = await buildCurrentTarget(parsed);

  if (parsed.verbose) {
    console.log(`${badges.info} Command: ${colors.gray(result.commandExecuted)}`);
  }

  logCompilerOutput(result.stdout, result.stderr);

  if (result.copiedDlls && result.copiedDlls.length > 0) {
    console.log(
      `${badges.info} Copied ${colors.cyan(String(result.copiedDlls.length))} runtime DLL(s): ${colors.gray(result.copiedDlls.join(', '))}`
    );
  }

  if (result.success) {
    const proj = result.projectInfo;
    const projDesc = proj?.name
      ? `${colors.bold(proj.name)}${proj.version ? ` v${proj.version}` : ''} (${proj.type || 'executable'})`
      : colors.bold(path.basename(result.executablePath));

    console.log(
      `${badges.success} Built ${projDesc} using ${colors.cyan(
        result.compiler.name
      )} in ${colors.green(formatDuration(result.durationMs))}`
    );
    return true;
  } else {
    console.error(
      `${badges.error} Compilation failed (${colors.red(formatDuration(result.durationMs))})`
    );
    return false;
  }
}

async function handleRun(parsed: ParsedArgs): Promise<void> {
  console.log(`${badges.cppc} Compiling...`);
  const compileResult = await buildCurrentTarget(parsed);

  if (parsed.verbose) {
    console.log(`${badges.info} Command: ${colors.gray(compileResult.commandExecuted)}`);
  }

  logCompilerOutput(compileResult.stdout, compileResult.stderr);

  if (compileResult.copiedDlls && compileResult.copiedDlls.length > 0) {
    console.log(
      `${badges.info} Copied ${colors.cyan(String(compileResult.copiedDlls.length))} runtime DLL(s): ${colors.gray(compileResult.copiedDlls.join(', '))}`
    );
  }

  if (!compileResult.success) {
    console.error(
      `${badges.error} Compilation failed (${colors.red(formatDuration(compileResult.durationMs))})`
    );
    process.exit(1);
  }

  const proj = compileResult.projectInfo;
  const projDesc = proj?.name
    ? `${colors.bold(proj.name)}${proj.version ? ` v${proj.version}` : ''} (${proj.type || 'executable'})`
    : colors.bold(path.basename(compileResult.executablePath));

  console.log(
    `${badges.success} Built ${projDesc} in ${colors.green(
      formatDuration(compileResult.durationMs)
    )}`
  );

  console.log(`${badges.run} Starting execution...\n----------------------------------------`);
  const runResult = await runExecutable(compileResult.executablePath, {
    args: parsed.programArgs,
    vendorBinDirs: compileResult.vendorBinDirs,
  });

  console.log(`----------------------------------------`);
  const codeStr = runResult.exitCode === 0 ? colors.green('0') : colors.red(String(runResult.exitCode));
  console.log(
    `${badges.run} Process exited with code ${codeStr} in ${colors.green(
      formatDuration(runResult.durationMs)
    )}`
  );
  if (runResult.exitCode !== null && runResult.exitCode !== 0) {
    process.exit(runResult.exitCode);
  }
}

async function handlePackage(parsed: ParsedArgs): Promise<void> {
  console.log(`${badges.cppc} Packaging project for distribution...`);

  try {
    const result = await packageProject({
      workingDir: parsed.options.workingDir,
      project: parsed.projectName,
      profile: parsed.options.profile || 'release',
      compiler: parsed.options.compiler,
      distDir: parsed.distDir,
      zip: parsed.packageZip,
      clean: parsed.options.clean,
      verbose: parsed.verbose,
    });

    console.log();
    console.log(`${badges.success} Package created: ${colors.bold(result.packageName)}`);
    console.log(`  Directory: ${colors.cyan(result.packageDir)}`);
    if (result.zipPath) {
      console.log(`  Archive:   ${colors.green(result.zipPath)}`);
    }
    console.log(`  Files included (${result.copiedFiles.length}):`);
    for (const f of result.copiedFiles) {
      console.log(`    ${colors.bold(colors.cyan('•'))} ${colors.gray(f)}`);
    }
    console.log(`  Completed in ${colors.green(formatDuration(result.durationMs))}\n`);
  } catch (err: any) {
    console.error(`${badges.error} Packaging failed: ${err.message}`);
    process.exit(1);
  }
}

async function handleTest(parsed: ParsedArgs): Promise<void> {
  console.log(`${badges.cppc} Running tests...`);

  const testSources = parsed.options.sources && parsed.options.sources.length > 0
    ? parsed.options.sources
    : ['test/**/*.cpp', 'tests/**/*.cpp', '*test*.cpp'];

  let framework = parsed.testFramework ?? 'auto';
  let detectedFramework = '';

  if (framework === 'auto') {
    const cwd = parsed.options.workingDir ?? process.cwd();
    try {
      const files = fs.readdirSync(cwd, { recursive: true }).filter((f: any) => f.toString().endsWith('.cpp'));
      if (files.length > 0) {
        const content = fs.readFileSync(path.join(cwd, files[0] as string), 'utf8');
        if (content.includes('gtest') || content.includes('TEST_F') || content.includes('TEST(')) {
          framework = 'gtest';
          detectedFramework = 'GoogleTest';
        } else if (content.includes('catch2') || content.includes('CATCH')) {
          framework = 'catch2';
          detectedFramework = 'Catch2';
        } else if (content.includes('doctest') || content.includes('DOCTEST')) {
          framework = 'doctest';
          detectedFramework = 'doctest';
        }
      }
    } catch {
      // Ignore
    }
  }

  if (framework === 'auto') {
    framework = 'gtest';
    detectedFramework = 'GoogleTest';
  }

  if (!detectedFramework) {
    detectedFramework = framework === 'gtest' ? 'GoogleTest' : framework === 'catch2' ? 'Catch2' : 'doctest';
  }

  console.log(`${badges.info} Framework: ${colors.cyan(detectedFramework)}`);

  const testOptions: Partial<CompileOptions> = {
    ...parsed.options,
    sources: testSources,
    name: 'test_runner',
  };

  if (parsed.testRebuild !== false) {
    console.log(`${badges.cppc} Compiling tests...`);
    const compileResult = await compile(testOptions);

    if (parsed.verbose) {
      console.log(`${badges.info} Command: ${colors.gray(compileResult.commandExecuted)}`);
    }

    logCompilerOutput(compileResult.stdout, compileResult.stderr);

    if (!compileResult.success) {
      console.error(
        `${badges.error} Test compilation failed (${colors.red(formatDuration(compileResult.durationMs))})`
      );
      process.exit(1);
    }

    console.log(
      `${badges.success} Tests compiled in ${colors.green(formatDuration(compileResult.durationMs))}`
    );
  }

  const testExe = path.resolve(
    parsed.options.workingDir ?? process.cwd(),
    parsed.options.binDir ?? 'target/bin',
    process.platform === 'win32' ? 'test_runner.exe' : 'test_runner'
  );

  if (!fs.existsSync(testExe)) {
    console.error(`${badges.error} Test executable not found: ${testExe}`);
    process.exit(1);
  }

  const testArgs: string[] = [];
  if (parsed.testFilter) {
    if (framework === 'gtest') {
      testArgs.push(`--gtest_filter=${parsed.testFilter}`);
    } else if (framework === 'catch2') {
      testArgs.push(parsed.testFilter);
    } else if (framework === 'doctest') {
      testArgs.push(`-tc=${parsed.testFilter}`);
    }
  }

  if (parsed.verbose) {
    if (framework === 'gtest') {
      testArgs.push('--gtest_print_time=1');
    }
  }

  console.log(`\n----------------------------------------`);
  const startTime = Date.now();
  const runResult = await runExecutable(testExe, {
    args: [...testArgs, ...parsed.programArgs],
  });
  const durationMs = Date.now() - startTime;

  console.log(`----------------------------------------`);
  const codeStr = runResult.exitCode === 0 ? colors.green('0') : colors.red(String(runResult.exitCode));
  console.log(
    `${badges.run} Tests exited with code ${codeStr} in ${colors.green(formatDuration(durationMs))}`
  );

  if (runResult.exitCode !== null && runResult.exitCode !== 0) {
    process.exit(runResult.exitCode);
  }
}

async function handleWatch(parsed: ParsedArgs): Promise<void> {
  console.log(`${badges.watch} Starting watch mode...`);
  const targets = parsed.sources.length > 0 ? parsed.sources : [process.cwd()];

  let isBuilding = false;
  const executeCycle = async (fileChanged?: string) => {
    if (isBuilding) return;
    isBuilding = true;
    try {
      if (fileChanged) {
        console.log(`\n${badges.watch} Change detected in ${colors.cyan(path.basename(fileChanged))}`);
      }

      if (parsed.watchRun || parsed.command === 'run') {
        const compileResult = await compile(parsed.options);
        logCompilerOutput(compileResult.stdout, compileResult.stderr);
        if (compileResult.success) {
          console.log(
            `${badges.success} Rebuilt in ${colors.green(formatDuration(compileResult.durationMs))}`
          );
          console.log(`${badges.run} Starting execution...\n----------------------------------------`);
          const runResult = await runExecutable(compileResult.executablePath, {
            args: parsed.programArgs,
            vendorBinDirs: compileResult.vendorBinDirs,
          });
          console.log(`----------------------------------------`);
          const codeStr = runResult.exitCode === 0 ? colors.green('0') : colors.red(String(runResult.exitCode));
          console.log(
            `${badges.run} Process exited with code ${codeStr} in ${colors.green(
              formatDuration(runResult.durationMs)
            )}`
          );
        } else {
          console.error(`${badges.error} Rebuild failed.`);
        }
      } else {
        const success = await handleBuild(parsed);
        if (success) {
          console.log(`${badges.watch} Waiting for changes...`);
        }
      }
    } catch (err: any) {
      console.error(`${badges.error} ${err.message}`);
    } finally {
      isBuilding = false;
    }
  };

  await executeCycle();

  const watcher = new FileWatcher({
    targets,
    onChange: (changed) => executeCycle(changed),
  });

  watcher.start();
  console.log(`${badges.watch} Watching for file changes. Press Ctrl+C to exit.\n`);
}

async function main() {
  const parsed = parseArgs(process.argv.slice(2));

  try {
    const workspace = discoverWorkspace(parsed.options.workingDir || process.cwd());
    if (parsed.projectName && workspace) {
      const proj = findProjectInWorkspace(workspace, parsed.projectName);
      if (proj) {
        parsed.projectName = proj.name;
        parsed.options.workingDir = proj.dir;
        if (!parsed.options.type) parsed.options.type = proj.config.type as ProjectType;
        if (!parsed.options.std) parsed.options.std = proj.config.std as CppStandard;
      } else {
        console.error(`${badges.error} Project "${parsed.projectName}" not found in workspace.`);
        console.log(`  Available projects:`);
        for (const p of workspace.projects) {
          console.log(`    - ${colors.cyan(p.name)} (${p.relDir})`);
        }
        process.exit(1);
      }
    }

    switch (parsed.command) {
      case 'help':
        console.log(HELP_TEXT);
        break;
      case 'version':
        console.log('Sugar++ v2.0.0 (spp / s++)');
        break;
      case 'list-compilers':
        await handleListCompilers();
        break;
      case 'init':
        await handleInit(parsed);
        break;
      case 'workspace':
        await handleWorkspace(parsed);
        break;
      case 'watch':
        await handleWatch(parsed);
        break;
      case 'test':
        await handleTest(parsed);
        break;
      case 'run': {
        const handled = await showBuildMenu(parsed);
        if (handled) break;
        await handleRun(parsed);
        break;
      }
      case 'package': {
        const handled = await showBuildMenu(parsed);
        if (handled) break;
        await handlePackage(parsed);
        break;
      }
      case 'build':
      default: {
        const handled = await showBuildMenu(parsed);
        if (handled) break;

        const success = await handleBuild(parsed);
        if (!success) {
          process.exit(1);
        }
        break;
      }
    }
  } catch (err: any) {
    console.error(`${badges.error} ${err.message}`);
    process.exit(1);
  }
}

main();
