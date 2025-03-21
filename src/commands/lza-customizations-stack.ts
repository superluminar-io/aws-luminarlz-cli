import { Command, Option } from 'clipanion';
import { loadConfigSync } from '../config';

export abstract class LzaCustomizationsStack extends Command {
  static namespacePath = ['lza', 'customizations-stack'];
  static category = 'LZA Customizations Stack';

  stackName = Option.String('--stack-name', {
    required: true,
  });
  accountId = Option.String('--account-id', {
    required: true,
  });
  region = Option.String('--region');

  protected get regionOrHomeRegion () {
    const config = loadConfigSync();
    return this.region ?? config.homeRegion;
  }

  abstract execute(): Promise<void>;
}