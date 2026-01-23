import { Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { UpdateAlternateContacts } from './constructs/aws-alternate-contacts/update-alternate-contacts';
import * as hash from 'object-hash';
import { AllAccounts } from '../../config';

/**
 * Set alternate contacts for all accounts using the `alternateContactEmail`.
 */
export class AlternateContactsStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    new UpdateAlternateContacts(this, 'UpdateAlternateContacts', {
      updateTrigger: hash(AllAccounts), // will update the contacts when the accounts change
    });
  }
}
