import 'aws-sdk-client-mock-jest';
import { toHaveBeenCalledInOrderWith } from './matchers/toHaveBeenCalledInOrderWith';
import { toHaveCreatedCdkTemplates } from './matchers/toHaveCreatedCdkTemplates';

const customMatchers = {
  toHaveCreatedCdkTemplates,
  toHaveBeenCalledInOrderWith,
};

expect.extend(customMatchers);

type CustomMatchers = {
  [K in keyof typeof customMatchers]: (...args: any[]) => any;
};

declare global {
  namespace jest {
    interface Matchers<R> extends CustomMatchers {}
  }
}