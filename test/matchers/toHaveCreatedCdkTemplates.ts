import fs from 'fs';
import path from 'path';

interface CdkConfig {
  awsAcceleratorConfigOutPath: string;
  cdkOutPath: string;
}

export function toHaveCreatedCdkTemplates(
  receivedConfig: CdkConfig,
  options: { baseDir: string },
) {
  const { baseDir } = options ?? {};

  if (!baseDir) {
    return {
      pass: false,
      message: () =>
        'Matcher "toHaveCreatedCdkTemplates" requires the option { baseDir }.',
    };
  }

  const outputDirectoryPath = path.join(
    baseDir,
    receivedConfig.awsAcceleratorConfigOutPath,
    receivedConfig.cdkOutPath,
  );

  let directoryEntries: string[] = [];
  try {
    directoryEntries = fs.readdirSync(outputDirectoryPath, {
      recursive: true,
      encoding: 'utf8',
    }) as unknown as string[];
  } catch (readError: unknown) {
    const errorMessage =
            readError instanceof Error ? readError.message : String(readError);
    return {
      pass: false,
      message: () =>
        `Expected CDK output directory to exist at: ${outputDirectoryPath}\n` +
                `Error: ${errorMessage}`,
    };
  }

  const hasTemplateFiles = directoryEntries.some((fileName) =>
    fileName.endsWith('.template.json'),
  );

  if (hasTemplateFiles) {
    return {
      pass: true,
      message: () =>
        `Expected no template files, but found at least one in ${outputDirectoryPath}.`,
    };
  }

  const directoryPreview =
        directoryEntries.slice(0, 10).map((entry) => `  - ${entry}`).join('\n') ||
        '  (directory empty)';

  return {
    pass: false,
    message: () =>
      `No *.template.json files found under ${outputDirectoryPath}\n` +
            `Directory preview:\n${directoryPreview}`,
  };
}
