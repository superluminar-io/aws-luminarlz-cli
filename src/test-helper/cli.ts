import { BaseContext, Cli, CommandClass } from 'clipanion';
import { useTempDir } from './useTempDir';


function createCliFor<C extends BaseContext>(...commands: CommandClass<C>[]): Cli<C> {
  const cli = new Cli<C>();
  commands.forEach(command => cli.register(command));
  return cli;
}

async function runCli(cli: Cli<any>, argv: string[], temp: ReturnType<typeof useTempDir>) {
  const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  const prevCwd = process.cwd();
  process.chdir(temp.dir);
  const code = await cli.run(argv, {
    stdin: process.stdin,
    stdout: process.stdout,
    stderr: process.stderr,
    cwd: () => process.cwd(),
    env: process.env,
  });
  logSpy.mockRestore();

  if (typeof code === 'number' && code !== 0) {
    throw new Error(`CLI exited with code ${code}`);
  }
  process.chdir(prevCwd);
  return code;
}

export { createCliFor, runCli };