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

const getTrailingWhitespaceInfo = (line: string): string => {
  const trailing = line.match(/([ \t\r\u00A0]+)$/u)?.[1];
  if (!trailing) {
    return '';
  }

  const spaces = (trailing.match(/ /g) || []).length;
  const tabs = (trailing.match(/\t/g) || []).length;
  const carriageReturns = (trailing.match(/\r/g) || []).length;
  const nbsp = (trailing.match(/\u00A0/g) || []).length;

  const parts: string[] = [];
  if (spaces > 0) parts.push(`spaces=${spaces}`);
  if (tabs > 0) parts.push(`tabs=${tabs}`);
  if (carriageReturns > 0) parts.push(`cr=${carriageReturns}`);
  if (nbsp > 0) parts.push(`nbsp=${nbsp}`);

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
