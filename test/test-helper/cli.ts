import { Writable } from 'node:stream';
import { BaseContext, Cli, CommandClass } from 'clipanion';
import { useTempDir } from './use-temp-dir';


class CliError extends Error {
  constructor() {
    super('CLI exited with code 1');
  }
}

function createCliFor<C extends BaseContext>(...commands: CommandClass<C>[]): Cli<C> {
  const cli = new Cli<C>();
  commands.forEach(command => cli.register(command));
  return cli;
}

async function runCli(cli: Cli<any>, argv: string[], temp: ReturnType<typeof useTempDir>) {
  const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  const prevCwd = process.cwd();
  process.chdir(temp.directory);
  const silentStream = new Writable({
    write(_chunk, _encoding, callback):void {
      callback();
    },
  }); const code = await cli.run(argv, {
    stdin: process.stdin,
    stdout: silentStream,
    stderr: silentStream,
    cwd: () => process.cwd(),
    env: process.env,
  });
  logSpy.mockRestore();

  if (code !== 0) {
    throw new CliError();
  }
  process.chdir(prevCwd);
  return code;
}

export { createCliFor, runCli, CliError };