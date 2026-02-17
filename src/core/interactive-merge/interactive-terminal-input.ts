import { UserAbortError } from './interactive-errors';
import { OutputWriter, PromptReader } from './interactive-types';

interface InteractiveInputState {
  isRaw: boolean;
}

type ChoiceInputOutcome =
  | { type: 'abort' }
  | { type: 'default' }
  | { type: 'choice'; value: string }
  | { type: 'ignore' };

const isAbortSelection = (value: string): boolean => value === 'a';

export class InteractiveTerminalInput {
  constructor(
    private readonly rl: PromptReader,
    private readonly stdout: OutputWriter,
  ) {}

  async readChoice(
    prompt: string,
    allowedChoices: Set<string>,
    defaultChoice: string,
  ): Promise<string> {
    if (!this.isInteractiveTerminal()) {
      return this.readLineChoice(prompt, allowedChoices, defaultChoice);
    }
    return this.readSingleKeyChoice(prompt, allowedChoices, defaultChoice);
  }

  async waitForAnyKey(
    modeLabel = 'block',
    filePath?: string,
    isDryRun = false,
  ): Promise<string> {
    if (!this.isInteractiveTerminal()) {
      return this.readLineAnyKey(modeLabel, filePath, isDryRun);
    }

    return this.readRawAnyKey(modeLabel, filePath, isDryRun);
  }

  private isInteractiveTerminal(): boolean {
    return process.stdin.isTTY && typeof process.stdin.setRawMode === 'function';
  }

  private async readLineChoice(
    prompt: string,
    allowedChoices: Set<string>,
    defaultChoice: string,
  ): Promise<string> {
    while (true) {
      const answer = (await this.rl.question(prompt)).trim().toLowerCase();
      if (answer.length === 0) {
        return defaultChoice;
      }

      const choice = answer[0];
      if (allowedChoices.has(choice)) {
        return choice;
      }

      this.writeLine(`Invalid choice "${answer}". Allowed: ${Array.from(allowedChoices).join(', ')}`);
    }
  }

  private buildModePrefix(modeLabel: string, filePath?: string, isDryRun = false): string {
    const dryRunLabel = isDryRun ? '[DRY RUN]' : '';
    const fileLabel = filePath ? ` [${filePath}]` : '';
    return `[${modeLabel.toUpperCase()} MODE]${dryRunLabel}${fileLabel}`;
  }

  private async readLineAnyKey(modeLabel: string, filePath?: string, isDryRun = false): Promise<string> {
    const prompt = `${this.buildModePrefix(modeLabel, filePath, isDryRun)} Press Enter to continue, type l to preview this block in line mode, or a to abort: `;
    const answer = (await this.rl.question(prompt)).trim().toLowerCase();
    if (isAbortSelection(answer)) {
      throw new UserAbortError();
    }
    return answer;
  }

  private readRawAnyKey(modeLabel: string, filePath?: string, isDryRun = false): Promise<string> {
    this.writeLine(`${this.buildModePrefix(modeLabel, filePath, isDryRun)} Press any key to continue (press l for line mode on this block, a to abort)...`);

    return new Promise<string>((resolve, reject) => {
      const stdinState = this.enterRawMode();
      process.stdin.once('data', (data: Buffer) => {
        const key = data.toString('utf8').toLowerCase();
        this.restoreRawMode(stdinState);
        if (this.isAbortKey(key)) {
          reject(new UserAbortError());
          return;
        }
        resolve(key);
      });
    });
  }

  private async readSingleKeyChoice(
    prompt: string,
    allowedChoices: Set<string>,
    defaultChoice: string,
  ): Promise<string> {
    this.write(prompt);

    return new Promise<string>((resolve, reject) => {
      const stdinState = this.enterRawMode();

      const onData = (data: Buffer) => {
        const outcome = this.parseChoiceInput(data, allowedChoices);
        if (outcome.type === 'ignore') {
          return;
        }

        cleanup();
        if (outcome.type === 'abort') {
          reject(new UserAbortError());
          return;
        }
        if (outcome.type === 'default') {
          this.write('\n');
          resolve(defaultChoice);
          return;
        }

        this.write('\n');
        resolve(outcome.value);
      };

      const cleanup = () => {
        process.stdin.off('data', onData);
        this.restoreRawMode(stdinState);
      };

      process.stdin.on('data', onData);
    });
  }

  private parseChoiceInput(
    data: Buffer,
    allowedChoices: Set<string>,
  ): ChoiceInputOutcome {
    const input = data.toString('utf8').toLowerCase();

    if (this.isAbortKey(input)) {
      return { type: 'abort' };
    }

    if (this.isDefaultSelectionKey(input)) {
      return { type: 'default' };
    }

    return this.resolveChoiceInputOutcome(input, allowedChoices);
  }

  private resolveChoiceInputOutcome(input: string, allowedChoices: Set<string>): ChoiceInputOutcome {
    const key = input[0];
    if (!key || !allowedChoices.has(key)) {
      return { type: 'ignore' };
    }

    return { type: 'choice', value: key };
  }

  private isAbortKey(input: string): boolean {
    return input === '\u0003' || isAbortSelection(input);
  }

  private isDefaultSelectionKey(input: string): boolean {
    return input === '\r' || input === '\n';
  }

  private enterRawMode(): InteractiveInputState {
    const isRaw = Boolean(process.stdin.isRaw);
    process.stdin.setRawMode(true);
    process.stdin.resume();
    return { isRaw };
  }

  private restoreRawMode(state: InteractiveInputState): void {
    process.stdin.setRawMode(state.isRaw);
    if (!state.isRaw) {
      process.stdin.pause();
    }
  }

  private write(text: string): void {
    this.stdout.write(text);
  }

  private writeLine(text: string): void {
    this.stdout.write(`${text}\n`);
  }
}
