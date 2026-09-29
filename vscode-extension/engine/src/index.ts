import { selectCompiler, createCompilerDriver } from './compilers/index.js';
import { runExecutable } from './runner.js';
import { findConfigFile, loadConfigFile, mergeConfigWithOptions } from './config.js';
import type { CompileOptions, CompileResult, RunOptions, RunResult, CompilerInfo } from './types.js';

export * from './types.js';
export * from './compilers/index.js';
export * from './runner.js';
export * from './watcher.js';
export * from './config.js';
export * from './workspace.js';
export * from './packager.js';
export * from './ui.js';
export * from './ui/prompts.js';
export * from './utils/files.js';
export * from './utils/folders.js';

export async function compile(options: Partial<CompileOptions> = {}): Promise<CompileResult> {
  const configFile = findConfigFile(options.workingDir);
  const fileConfig = configFile ? loadConfigFile(configFile) : null;
  const finalOptions = mergeConfigWithOptions(fileConfig, options);

  const compilerInfo = await selectCompiler(finalOptions.compiler);
  const driver = createCompilerDriver(compilerInfo);

  return driver.compile(finalOptions);
}

export async function compileAndRun(
  compileOptions: Partial<CompileOptions> = {},
  runOptions: RunOptions = {}
): Promise<{ compileResult: CompileResult; runResult?: RunResult }> {
  const compileResult = await compile(compileOptions);
  if (!compileResult.success) {
    return { compileResult };
  }

  const runResult = await runExecutable(compileResult.executablePath, runOptions);
  return { compileResult, runResult };
}
