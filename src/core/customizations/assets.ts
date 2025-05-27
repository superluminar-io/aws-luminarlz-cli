import * as fs from 'fs';
import {
  AssetManifest,
  AssetPublishing, ClientOptions,
  DefaultAwsClient,
  EventType, IAws,
  IPublishProgress,
  IPublishProgressListener, IS3Client,
} from '@aws-cdk/cdk-assets-lib';
import { loadConfigSync } from '../../config';
import { resolveProjectPath } from '../util/path';

export const customizationsPublishCdkAssets = async (): Promise<void> => {
  const config = loadConfigSync();
  const assetFileNames = fs
    .readdirSync(resolveProjectPath(config.cdkOutPath), {
      recursive: true,
    })
    .map((fileName) => {
      if (!fileName || typeof fileName !== 'string') {
        throw new Error('Invalid file name');
      }
      return resolveProjectPath(config.cdkOutPath, fileName);
    })
    .filter((fileName) => {
      return (
        fs.lstatSync(fileName).isFile() && fileName.endsWith('.assets.json')
      );
    });

  const assetManifests: { assetManifest: AssetManifest; region: string }[] = assetFileNames
    .flatMap((fileName) => {
      return config.enabledRegions.map((region) => {
        return {
          assetManifest: AssetManifest.fromFile(fileName),
          region,
        };
      });
    });

  const progressListener = new ConsoleProgress();

  // publish the asset files in chunks to avoid throttling
  const maxConcurrentUploads = 30;
  for (const chunk of chunks(assetManifests, maxConcurrentUploads)) {
    const execs = chunk.map(({ assetManifest, region }) => {
      const assetPublishing = new AssetPublishing(assetManifest, {
        aws: RegionAwareAwsClient.makeClient(region),
        progressListener,
      });
      return assetPublishing.publish({ allowCrossAccount: false });
    });
    await Promise.all(execs);
  }
};

/**
 * Currently, the cdk-assets-lib doesn't seem to support publishing another way
 * to parameterize the region.
 */
class RegionAwareAwsClient extends DefaultAwsClient {
  /**
   * Make or retrieve a cached client for the given region.
   */
  static makeClient(region: string): IAws {
    if (!RegionAwareAwsClient.clients[region]) {
      RegionAwareAwsClient.clients[region] = new RegionAwareAwsClient(region);
    }
    return RegionAwareAwsClient.clients[region];
  }
  private static clients: { [region: string]: RegionAwareAwsClient } = {};

  constructor(private region: string) {
    super();
  }

  discoverDefaultRegion(): Promise<string> {
    // Override to always return the region we were constructed with.
    return Promise.resolve(this.region);
  }

  s3Client(options: ClientOptions): Promise<IS3Client> {
    // Override to always use the region we were constructed with if none was given.
    if (!options.region) {
      options.region = this.region;
    }
    return super.s3Client(options);
  }
}

/**
 * Taken and adapted from https://github.com/aws/aws-cdk-cli/blob/main/packages/cdk-assets/bin/publish.ts#L59
 * Currently, there is no built-in console progress reporter.
 */
class ConsoleProgress implements IPublishProgressListener {
  static EVENT_TO_LEVEL = {
    build: 'verbose',
    cached: 'verbose',
    check: 'verbose',
    debug: 'verbose',
    fail: 'error',
    found: 'verbose',
    start: 'info',
    success: 'info',
    upload: 'verbose',
    shell_open: 'verbose',
    shell_stdout: 'verbose',
    shell_stderr: 'verbose',
    shell_close: 'verbose',
  };

  public onPublishEvent(type: EventType, event: IPublishProgress): void {
    switch (ConsoleProgress.EVENT_TO_LEVEL[type]) {
      case 'error':
        console.error(ConsoleProgress.EVENT_TO_LEVEL[type], `[${event.percentComplete}%] ${type}: ${event.message}`);
        break;
      case 'info':
        console.info(ConsoleProgress.EVENT_TO_LEVEL[type], `[${event.percentComplete}%] ${type}: ${event.message}`);
        break;
    }
  }
}

/**
 * Splits an array into chunks of the specified size.
 */
function* chunks<T>(arr: T[], n: number) {
  for (let i = 0; i < arr.length; i += n) {
    yield arr.slice(i, i + n);
  }
}