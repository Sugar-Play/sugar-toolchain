export type CompilerType = 'msvc' | 'gcc' | 'clang';

export type CppStandard =
  | 'c++11'
  | 'c++14'
  | 'c++17'
  | 'c++20'
  | 'c++23'
  | 'c++26'
  | 'latest';

export type CStandard =
  | 'c11'
  | 'c17'
  | 'c23'
  | 'c_latest';

export type OptimizationLevel = 'O0' | 'O1' | 'O2' | 'O3' | 'Os' | 'Oz';

export type ProjectType =
  | 'exe'
  | 'executable'
  | 'static'
  | 'lib'
  | 'dynamic'
  | 'shared'
  | 'dll'
  | 'header-only';

export type BuildProfile = 'debug' | 'release' | 'relwithdebinfo' | 'minsizerel';

export type SanitizerKind = 'address' | 'undefined' | 'thread' | 'memory' | 'leak';

export interface CompilerInfo {
  type: CompilerType;
  name: string;
  executable: string;
  version?: string;
  vcvarsPath?: string;
  architecture?: string;
  available: boolean;
}

export interface CompileOptions {
  sources: string[];
  output?: string;
  name?: string;
  version?: string;
  type?: ProjectType;
  compiler?: CompilerType | 'auto';
  profile?: BuildProfile;
  std?: CppStandard;
  cStandard?: CStandard;
  optimization?: OptimizationLevel;
  debug?: boolean;
  warnings?: 'all' | 'none' | 'default';
  warningsAsErrors?: boolean;
  srcDir?: string;
  includeDir?: string;
  vendorDir?: string;
  targetDir?: string;
  objectDir?: string;
  binDir?: string;
  libDir?: string;
  autoDiscoverVendor?: boolean;
  copyDlls?: boolean;
  includeDirs?: string[];
  libDirs?: string[];
  libs?: string[];
  defines?: string[];
  customFlags?: string[];
  workingDir?: string;
  clean?: boolean;
  parallel?: boolean;
  jobs?: number;
  sanitizers?: SanitizerKind[];
  lto?: boolean;
  pch?: string;
  cSources?: string[];
}

export interface CompileResult {
  success: boolean;
  executablePath: string;
  durationMs: number;
  compiler: CompilerInfo;
  stdout: string;
  stderr: string;
  commandExecuted: string;
  copiedDlls?: string[];
  vendorBinDirs?: string[];
  projectInfo?: {
    name?: string;
    version?: string;
    type?: ProjectType;
  };
}

export interface RunOptions {
  args?: string[];
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  interactive?: boolean;
  timeout?: number;
  vendorBinDirs?: string[];
}

export interface RunResult {
  exitCode: number | null;
  signal: string | null;
  durationMs: number;
  error?: Error;
}

export interface ProjectConfig {
  name?: string;
  version?: string;
  type?: ProjectType;
  description?: string;
  author?: string;
  license?: string;

  compiler?: CompilerType | 'auto';
  profile?: BuildProfile;
  std?: CppStandard;
  cStandard?: CStandard;
  optimization?: OptimizationLevel;
  debug?: boolean;
  warnings?: 'all' | 'none' | 'default';
  warningsAsErrors?: boolean;
  srcDir?: string;
  includeDir?: string;
  vendorDir?: string;
  targetDir?: string;
  objectDir?: string;
  binDir?: string;
  libDir?: string;
  autoDiscoverVendor?: boolean;
  copyDlls?: boolean;
  sources?: string[];
  output?: string;
  includeDirs?: string[];
  libDirs?: string[];
  libs?: string[];
  defines?: string[];
  customFlags?: string[];
  parallel?: boolean;
  jobs?: number;
  sanitizers?: SanitizerKind[];
  lto?: boolean;
  pch?: string;

  /** Workspace dependencies: names, folder names, or relative paths of other projects */
  dependsOn?: string[];

  /** Extra assets, resources, or files to copy when packaging/distributing */
  assets?: string[];
}

export interface PackageOptions {
  workingDir?: string;
  project?: string;
  profile?: BuildProfile;
  distDir?: string;
  zip?: boolean;
  clean?: boolean;
  compiler?: CompilerType | 'auto';
  verbose?: boolean;
}

export interface PackageResult {
  success: boolean;
  packageName: string;
  packageDir: string;
  zipPath?: string;
  executablePath?: string;
  copiedFiles: string[];
  durationMs: number;
}

export interface WorkspaceConfig {
  name?: string;
  version?: string;
  description?: string;
  projects: string[];
}

export interface WorkspaceProject {
  name: string;
  dir: string;
  relDir: string;
  configPath: string;
  config: ProjectConfig;
  isRoot?: boolean;
  dependencies?: string[];
}

export interface WorkspaceInfo {
  rootDir: string;
  configPath: string;
  config: WorkspaceConfig;
  projects: WorkspaceProject[];
}

export interface TestOptions {
  sources: string[];
  framework?: 'gtest' | 'catch2' | 'doctest' | 'auto';
  filter?: string;
  rebuild?: boolean;
  verbose?: boolean;
  profile?: BuildProfile;
  args?: string[];
}

export interface TestResult {
  success: boolean;
  executablePath: string;
  durationMs: number;
  testsRun: number;
  testsPassed: number;
  testsFailed: number;
  framework: string;
  stdout: string;
  stderr: string;
}
