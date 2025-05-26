import * as path from 'path';

export const resolveProjectPath = (...additionalPaths: string[]) => {
  return path.join(path.resolve('.'), ...additionalPaths);
};
