import { CdkCustomResourceEvent, CdkCustomResourceHandler } from 'aws-lambda';
import * as organizations from '@aws-sdk/client-organizations';
import * as accountmanagement from '@aws-sdk/client-account';
import { AllAccounts, MANAGEMENT_ACCOUNT_ID } from '../../../../config';
import { AlternateContactType } from '@aws-sdk/client-account';

export const handler: CdkCustomResourceHandler = async (
  event: CdkCustomResourceEvent,
) => {
  switch (event.RequestType) {
    case 'Create':  // fall through on purpose
    case 'Update':
      const organizationsClient = new organizations.OrganizationsClient();
      const organizationsAccounts: organizations.Account[] = [];

      const accountClient = new accountmanagement.AccountClient();

      for await (const page of organizations.paginateListAccounts(
        { client: organizationsClient },
        {},
      )) {
        for (const account of page.Accounts ?? []) {
          if (account.Status === organizations.AccountStatus.ACTIVE) {
            organizationsAccounts.push(account);
          }
        }
      }

      // get the phone number from the management account
      const managementContactInformationResult = await accountClient.send(
        new accountmanagement.GetContactInformationCommand(),
      );
      if (!managementContactInformationResult.ContactInformation?.PhoneNumber) {
        throw new Error(
          'Management account contact information phone number not found',
        );
      }

      for (const organizationsAccount of organizationsAccounts) {
        const account = AllAccounts.find(
          (account) => account.email === organizationsAccount.Email,
        );
        if (account) {
          if (!organizationsAccount.Id) {
            throw new Error('Id missing in organizations account.');
          }
          for (const alternateContactType of Object.values(
            AlternateContactType,
          )) {
            await accountClient.send(
              new accountmanagement.PutAlternateContactCommand({
                AlternateContactType: alternateContactType,
                // The management account can only be managed using the standalone context from the management account.
                ...(MANAGEMENT_ACCOUNT_ID === organizationsAccount.Id
                  ? {}
                  : { AccountId: organizationsAccount.Id }),
                Title: 'Owner',
                Name: account.owner,
                EmailAddress: account.alternateContactEmail ?? account.email,
                PhoneNumber:
                  managementContactInformationResult.ContactInformation
                    .PhoneNumber,
              }),
            );
          }
        }
      }

      return {
        PhysicalResourceId: 'update-alternate-contacts',
        Status: 'SUCCESS',
      };
    case 'Delete':
      // Do Nothing
      return {
        PhysicalResourceId: event.PhysicalResourceId,
        Status: 'SUCCESS',
      };
  }
};
