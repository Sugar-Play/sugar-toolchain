import type { CompilerDriver } from './base.js';
import type { CompilerInfo } from '../types.js';
import { MsvcCompilerDriver } from './msvc.js';
import { GccClangCompilerDriver } from './gcc-clang.js';

export * from './base.js';
export * from './detector.js';
export * from './msvc.js';
export * from './gcc-clang.js';

export function createCompilerDriver(info: CompilerInfo): CompilerDriver {
  if (info.type === 'msvc') {
    return new MsvcCompilerDriver(info);
  }
  return new GccClangCompilerDriver(info);
}
