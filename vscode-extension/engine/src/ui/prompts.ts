import * as readline from 'node:readline';
import { colors } from '../ui.js';

export interface SelectOption {
  label: string;
  value: string;
  description?: string;
  icon?: string;
}

export interface SelectConfig {
  title: string;
  options: SelectOption[];
  defaultIndex?: number;
  pageSize?: number;
}

export interface MultiSelectConfig {
  title: string;
  options: SelectOption[];
  defaultSelected?: string[];
  pageSize?: number;
}

export async function promptSelect(config: SelectConfig): Promise<string> {
  const { title, options, defaultIndex = 0 } = config;

  if (
    !process.stdin.isTTY ||
    !process.stdout.isTTY ||
    typeof process.stdin.setRawMode !== 'function'
  ) {
    return options[defaultIndex]?.value ?? '';
  }

  return new Promise((resolve, reject) => {
    let currentIndex = Math.max(0, Math.min(defaultIndex, options.length - 1));
    let isResolved = false;
    let renderedLines = 0;

    const clearMenu = () => {
      if (renderedLines > 0) {
        readline.cursorTo(process.stdout, 0);
        readline.moveCursor(process.stdout, 0, -renderedLines);
        readline.clearScreenDown(process.stdout);
        renderedLines = 0;
      }
    };

    const cleanup = () => {
      if (!isResolved) {
        isResolved = true;
        process.stdin.removeListener('keypress', onKeypress);
        if (process.stdin.isTTY && typeof process.stdin.setRawMode === 'function') {
          process.stdin.setRawMode(false);
        }
        process.stdin.pause();
        process.stdout.write('\x1B[?25h');
        clearMenu();
      }
    };

    const render = () => {
      clearMenu();

      const lines: string[] = [];
      lines.push(`  ${colors.bold(colors.cyan(title))}`);
      lines.push(`  ${colors.gray('─'.repeat(40))}`);

      for (let i = 0; i < options.length; i++) {
        const opt = options[i];
        const isSelected = i === currentIndex;

        const cursor = isSelected ? colors.green('▸') : ' ';
        const label = isSelected ? colors.bold(colors.green(opt.label)) : opt.label;
        const desc = opt.description ? colors.gray(`  ${opt.description}`) : '';

        lines.push(`  ${cursor} ${label}${desc}`);
      }

      lines.push(`  ${colors.gray('─'.repeat(40))}`);
      lines.push(`  ${colors.gray('↑↓ Navigate  ↵ Select  Esc Cancel')}`);

      process.stdout.write(lines.join('\n') + '\n');
      renderedLines = lines.length;
    };

    const onKeypress = (str: string, key: readline.Key) => {
      if (isResolved) return;

      if ((key && key.ctrl && key.name === 'c') || str === '\u0003') {
        cleanup();
        process.exit(130);
      }

      if (key && (key.name === 'up' || key.name === 'k')) {
        currentIndex = (currentIndex - 1 + options.length) % options.length;
        render();
      } else if (key && (key.name === 'down' || key.name === 'j')) {
        currentIndex = (currentIndex + 1) % options.length;
        render();
      } else if (
        (key && (key.name === 'return' || key.name === 'enter')) ||
        str === '\r' ||
        str === '\n'
      ) {
        const selectedValue = options[currentIndex].value;
        cleanup();
        resolve(selectedValue);
      } else if ((key && key.name === 'escape') || str === '\u001b') {
        cleanup();
        reject(new Error('cancelled'));
      } else if (str && /^[1-9]$/.test(str)) {
        const num = parseInt(str, 10);
        if (num >= 1 && num <= options.length) {
          currentIndex = num - 1;
          render();
        }
      }
    };

    readline.emitKeypressEvents(process.stdin);
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdout.write('\x1B[?25l');

    process.stdin.on('keypress', onKeypress);

    render();
  });
}

export async function promptMultiSelect(config: MultiSelectConfig): Promise<string[]> {
  const { title, options, defaultSelected = [] } = config;

  if (
    !process.stdin.isTTY ||
    !process.stdout.isTTY ||
    typeof process.stdin.setRawMode !== 'function'
  ) {
    return defaultSelected;
  }

  return new Promise((resolve, reject) => {
    let cursorIndex = 0;
    const selected = new Set(defaultSelected);
    let isResolved = false;
    let renderedLines = 0;

    const clearMenu = () => {
      if (renderedLines > 0) {
        readline.cursorTo(process.stdout, 0);
        readline.moveCursor(process.stdout, 0, -renderedLines);
        readline.clearScreenDown(process.stdout);
        renderedLines = 0;
      }
    };

    const cleanup = () => {
      if (!isResolved) {
        isResolved = true;
        process.stdin.removeListener('keypress', onKeypress);
        if (process.stdin.isTTY && typeof process.stdin.setRawMode === 'function') {
          process.stdin.setRawMode(false);
        }
        process.stdin.pause();
        process.stdout.write('\x1B[?25h');
        clearMenu();
      }
    };

    const render = () => {
      clearMenu();

      const lines: string[] = [];
      lines.push(`  ${colors.bold(colors.cyan(title))}`);
      lines.push(`  ${colors.gray('─'.repeat(40))}`);

      for (let i = 0; i < options.length; i++) {
        const opt = options[i];
        const isCursor = i === cursorIndex;
        const isSelected = selected.has(opt.value);

        const checkbox = isSelected ? colors.green('■') : colors.gray('□');
        const cursor = isCursor ? colors.green('▸') : ' ';

        let label: string;
        if (isCursor) {
          label = colors.bold(colors.green(opt.label));
        } else if (isSelected) {
          label = colors.green(opt.label);
        } else {
          label = opt.label;
        }

        const desc = opt.description ? colors.gray(`  ${opt.description}`) : '';
        lines.push(`  ${cursor} ${checkbox} ${label}${desc}`);
      }

      lines.push(`  ${colors.gray('─'.repeat(40))}`);
      lines.push(`  ${colors.gray('↑↓ Navigate  Space Toggle  ↵ Confirm  Esc Cancel')}`);

      process.stdout.write(lines.join('\n') + '\n');
      renderedLines = lines.length;
    };

    const onKeypress = (str: string, key: readline.Key) => {
      if (isResolved) return;

      if ((key && key.ctrl && key.name === 'c') || str === '\u0003') {
        cleanup();
        process.exit(130);
      }

      if (key && (key.name === 'up' || key.name === 'k')) {
        cursorIndex = (cursorIndex - 1 + options.length) % options.length;
        render();
      } else if (key && (key.name === 'down' || key.name === 'j')) {
        cursorIndex = (cursorIndex + 1) % options.length;
        render();
      } else if ((key && key.name === 'space') || str === ' ') {
        const val = options[cursorIndex].value;
        if (selected.has(val)) {
          selected.delete(val);
        } else {
          selected.add(val);
        }
        render();
      } else if (
        (key && (key.name === 'return' || key.name === 'enter')) ||
        str === '\r' ||
        str === '\n'
      ) {
        const result = [...selected];
        cleanup();
        resolve(result);
      } else if ((key && key.name === 'escape') || str === '\u001b') {
        cleanup();
        reject(new Error('cancelled'));
      }
    };

    readline.emitKeypressEvents(process.stdin);
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdout.write('\x1B[?25l');

    process.stdin.on('keypress', onKeypress);

    render();
  });
}
