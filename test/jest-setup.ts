import 'aws-sdk-client-mock-jest';
import fs from 'fs';
import path from 'path';

type CdkConfig = {
  awsAcceleratorConfigOutPath: string;
  cdkOutPath: string;
};

expect.extend({
  toHaveCreatedCdkTemplates(
    received: CdkConfig,
    options: { baseDir: string },
  ) {
    const { baseDir } = options ?? ({} as any);

    if (!baseDir) {
      return {
        pass: false,
        message: () =>
          'toHaveCreatedCdkTemplates: missing option { baseDir }',
      };
    }

    const cdkOutPath = path.join(
      baseDir,
      received.awsAcceleratorConfigOutPath,
      received.cdkOutPath,
    );

    let entries: string[] = [];
    try {
      entries = fs.readdirSync(cdkOutPath, {
        recursive: true,
        encoding: 'utf8',
      }) as unknown as string[];
    } catch (e: any) {
      return {
        pass: false,
        message: () =>
          `Expected CDK output directory to exist: ${cdkOutPath}\nError: ${e?.message ?? e}`,
      };
    }

    const hasTemplates = entries.some((f) =>
      f.endsWith('.template.json'),
    );

    if (hasTemplates) {
      return {
        pass: true,
        message: () =>
          `Expected NO templates, but found at least one in ${cdkOutPath}`,
      };
    }

    const preview =
            entries.slice(0, 10).map((x) => `  - ${x}`).join('\n') ||
            '  (directory empty)';

    return {
      pass: false,
      message: () =>
        `No *.template.json files found under ${cdkOutPath}\nDirectory preview:\n${preview}`,
    };
  },
});

declare global {
  namespace jest {
    interface Matchers<R> {
      toHaveCreatedCdkTemplates(options: { baseDir: string }): R;
    }
  }
}