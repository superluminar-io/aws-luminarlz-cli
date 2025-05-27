import fs from 'fs';
import os from 'os';
import path from 'path';

export class TestProjectDirectory {
  directory = '';
  originalCwd = process.cwd();

  initAndChangeToTempDirectory() {
    this.directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aws-luminarlz-cli-test-'));

    // Change working directory for test
    process.chdir(this.directory);
  }

  changeToOriginalAndCleanUpTempDirectory() {
    // Restore the original working directory
    process.chdir(this.originalCwd);

    // Clean up temp directory
    if (this.directory === '') {
      throw new Error('Test project directory should not be empty');
    }
    fs.rmSync(this.directory, { recursive: true, force: true });
  }
}