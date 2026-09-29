import type { CompilerInfo, CompileOptions, CompileResult } from '../types.js';

export interface CompilerDriver {
  info: CompilerInfo;
  compile(options: CompileOptions): Promise<CompileResult>;
}
