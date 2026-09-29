export type BuildProfile = 'release' | 'debug' | 'relwithdebinfo' | 'minsizerel';
export type CompilerType = 'auto' | 'msvc' | 'gcc' | 'clang';

export interface ProjectConfig {
  name: string;
  version?: string;
  type?: 'exe' | 'static' | 'dynamic' | 'header-only';
  description?: string;
  compiler?: CompilerType;
  profile?: BuildProfile;
  std?: string;
  optimization?: string;
  debug?: boolean;
  warnings?: string;
  srcDir?: string;
  vendorDir?: string;
  targetDir?: string;
  binDir?: string;
  objectDir?: string;
  libDir?: string;
  output?: string;
  sources?: string[];
  includeDirs?: string[];
  libDirs?: string[];
  libs?: string[];
  defines?: string[];
  customFlags?: string[];
}

export interface WorkspaceProject {
  name: string;
  dir: string;
  relDir: string;
  config: ProjectConfig;
  isRoot: boolean;
}

export interface WorkspaceInfo {
  name: string;
  rootDir: string;
  projects: WorkspaceProject[];
}
