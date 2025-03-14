import * as path from 'path';

export const currentExecutionPath = (...additionalPaths: string[]) => {
  return path.join(path.resolve('.'), ...additionalPaths);
};
