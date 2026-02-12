import { toPendingConfigArtifactPath } from '../src/config';

describe('toPendingConfigArtifactPath', () => {
  it('should append pending before the zip extension', () => {
    expect(toPendingConfigArtifactPath('zipped/aws-accelerator-config.zip')).toBe('zipped/aws-accelerator-config-pending.zip');
  });

  it('should append pending suffix when the path has no zip extension', () => {
    expect(toPendingConfigArtifactPath('zipped/aws-accelerator-config')).toBe('zipped/aws-accelerator-config-pending');
  });
});
