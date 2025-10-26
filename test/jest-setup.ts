import 'aws-sdk-client-mock-jest';
import { toHaveBeenCalledInOrderWith } from './matchers/toHaveBeenCalledInOrderWith';
import { toHaveCreatedCdkTemplates } from './matchers/toHaveCreatedCdkTemplates';

expect.extend({
  toHaveCreatedCdkTemplates,
  toHaveBeenCalledInOrderWith,
});