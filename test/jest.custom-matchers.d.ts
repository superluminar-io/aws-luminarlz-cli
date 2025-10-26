import 'aws-sdk-client-mock-jest';
import type { CustomMatchers } from './matchers/register';

declare global {
    namespace jest {
        interface Matchers<R> extends CustomMatchers {}
    }
}
