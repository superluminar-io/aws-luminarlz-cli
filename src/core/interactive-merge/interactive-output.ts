const terminalColors = {
  reset: '\u001b[0m',
  red: '\u001b[31m',
  green: '\u001b[32m',
  cyan: '\u001b[36m',
  gray: '\u001b[90m',
} as const;

const supportsColor = (): boolean => {
  const isInteractiveTerminal = process.stdout.isTTY;
  return isInteractiveTerminal && !('NO_COLOR' in process.env);
};
const canUseColors = supportsColor();

const colorize = (text: string, color: keyof typeof terminalColors): string => {
  if (!canUseColors) {
    return text;
  }
  return `${terminalColors[color]}${text}${terminalColors.reset}`;
};

const countMatches = (value: string, pattern: RegExp): number => {
  return (value.match(pattern) || []).length;
};

const getTrailingWhitespaceCounts = (trailing: string): Array<[string, number]> => {
  return [
    ['spaces', countMatches(trailing, / /g)],
    ['tabs', countMatches(trailing, /\t/g)],
    ['cr', countMatches(trailing, /\r/g)],
    ['nbsp', countMatches(trailing, /\u00A0/g)],
  ];
};

const getTrailingWhitespaceInfo = (line: string): string => {
  const trailing = line.match(/([ \t\r\u00A0]+)$/u)?.[1];
  if (!trailing) {
    return '';
  }

  const parts = getTrailingWhitespaceCounts(trailing)
    .filter(([, count]) => count > 0)
    .map(([name, count]) => `${name}=${count}`);

  return parts.length > 0 ? colorize(`  [trailing whitespace: ${parts.join(', ')}]`, 'gray') : '';
};

export const colorizeDiffLine = (line: string): string => {
  const trailingWhitespaceInfo = getTrailingWhitespaceInfo(line);
  const lineWithHint = `${line}${trailingWhitespaceInfo}`;

  if (line.startsWith('+')) {
    return colorize(lineWithHint, 'green');
  }
  if (line.startsWith('-')) {
    return colorize(lineWithHint, 'red');
  }
  if (line.startsWith('@@ ')) {
    return colorize(lineWithHint, 'cyan');
  }
  return colorize(lineWithHint, 'gray');
};

export const colorizeInfo = (text: string): string => colorize(text, 'cyan');
export const colorizeMuted = (text: string): string => colorize(text, 'gray');
