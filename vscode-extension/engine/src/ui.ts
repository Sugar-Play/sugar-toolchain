const isColorSupported =
  !process.env.NO_COLOR &&
  (process.stdout.isTTY || process.env.FORCE_COLOR !== undefined);

export const colors = {
  reset: (str: string) => (isColorSupported ? `\x1b[0m${str}\x1b[0m` : str),
  bold: (str: string) => (isColorSupported ? `\x1b[1m${str}\x1b[22m` : str),
  dim: (str: string) => (isColorSupported ? `\x1b[2m${str}\x1b[22m` : str),
  green: (str: string) => (isColorSupported ? `\x1b[32m${str}\x1b[39m` : str),
  yellow: (str: string) => (isColorSupported ? `\x1b[33m${str}\x1b[39m` : str),
  red: (str: string) => (isColorSupported ? `\x1b[31m${str}\x1b[39m` : str),
  cyan: (str: string) => (isColorSupported ? `\x1b[36m${str}\x1b[39m` : str),
  blue: (str: string) => (isColorSupported ? `\x1b[34m${str}\x1b[39m` : str),
  magenta: (str: string) => (isColorSupported ? `\x1b[35m${str}\x1b[39m` : str),
  gray: (str: string) => (isColorSupported ? `\x1b[90m${str}\x1b[39m` : str),
};

export const badges = {
  sugar: colors.magenta(colors.bold('[SUGAR++]')),
  cppc: colors.magenta(colors.bold('[SUGAR++]')),
  success: colors.green(colors.bold('[SUCCESS]')),
  error: colors.red(colors.bold('[ERROR]')),
  warn: colors.yellow(colors.bold('[WARN]')),
  info: colors.blue(colors.bold('[INFO]')),
  run: colors.cyan(colors.bold('[RUN]')),
  watch: colors.cyan(colors.bold('[WATCH]')),
};

export function printBanner(): void {
  console.log(`${badges.sugar} ${colors.bold('Sugar++ C++ Build Engine')}`);
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

export function logCompilerOutput(stdout: string, stderr: string): void {
  if (stdout) {
    console.log(colors.gray(stdout));
  }
  if (stderr) {
    console.error(colors.red(stderr));
  }
}
