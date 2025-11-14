import { toHaveBeenCalledInOrderWith } from './toHaveBeenCalledInOrderWith';
import { toHaveCreatedCdkTemplates } from './toHaveCreatedCdkTemplates';

export const customMatchers = {
  toHaveCreatedCdkTemplates,
  toHaveBeenCalledInOrderWith,
};

expect.extend(customMatchers);

export type CustomMatchers = {
  [K in keyof typeof customMatchers]: (...args: any[]) => any;
};