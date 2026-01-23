import { Stack, StackProps } from 'aws-cdk-lib';
import { CfnCostCategory } from 'aws-cdk-lib/aws-ce';
import { Construct } from 'constructs';
import { AllAccounts } from '../../config';

const capitalized = (word: string) => {
  return word.charAt(0).toUpperCase() + word.slice(1);
};

const sanitizeName = (name: string) => {
  return capitalized(name).replace('/', '_');
};

/**
 * Create cost categories including all accounts.
 */
export class CostCategoriesStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    this.organizationalUnitCategory();
    this.environmentCategory();
    this.ownerCategory();
  }

  private environmentCategory() {
    const accountsByEnvironment = AllAccounts.reduce<Record<string, string[]>>(
      (acc, account) => {
        if (!acc[account.environment]) {
          acc[account.environment] = [];
        }
        acc[account.environment].push(account.name);
        return acc;
      },
      {},
    );

    new CfnCostCategory(this, 'EnvironmentCostCategory', {
      name: 'Environment',
      rules: JSON.stringify(
        Object.entries(accountsByEnvironment).map(
          ([environment, accountNames]) => {
            return {
              Type: 'REGULAR',
              Rule: {
                Dimensions: {
                  Key: 'LINKED_ACCOUNT_NAME',
                  Values: accountNames,
                },
              },
              Value: sanitizeName(environment),
            };
          },
        ),
      ),
      ruleVersion: 'CostCategoryExpression.v1',
    });
  }

  private organizationalUnitCategory() {
    const accountsByOrganizationalUnit = AllAccounts.reduce<
      Record<string, string[]>
    >((acc, account) => {
      if (!acc[account.organizationalUnit]) {
        acc[account.organizationalUnit] = [];
      }
      acc[account.organizationalUnit].push(account.name);
      return acc;
    }, {});

    new CfnCostCategory(this, 'OrganizationalUnitCostCategory', {
      name: 'OrganizationalUnit',
      rules: JSON.stringify(
        Object.entries(accountsByOrganizationalUnit).map(
          ([organizationalUnit, accountNames]) => {
            return {
              Type: 'REGULAR',
              Rule: {
                Dimensions: {
                  Key: 'LINKED_ACCOUNT_NAME',
                  Values: accountNames,
                },
              },
              Value: sanitizeName(organizationalUnit),
            };
          },
        ),
      ),
      ruleVersion: 'CostCategoryExpression.v1',
    });
  }

  private ownerCategory() {
    const accountsByOwner = AllAccounts.reduce<Record<string, string[]>>(
      (acc, account) => {
        if (!acc[account.owner]) {
          acc[account.owner] = [];
        }
        acc[account.owner].push(account.name);
        return acc;
      },
      {},
    );

    new CfnCostCategory(this, 'OwnerCostCategory', {
      name: 'Owner',
      rules: JSON.stringify(
        Object.entries(accountsByOwner).map(([owner, accountNames]) => {
          return {
            Type: 'REGULAR',
            Rule: {
              Dimensions: {
                Key: 'LINKED_ACCOUNT_NAME',
                Values: accountNames,
              },
            },
            Value: sanitizeName(owner),
          };
        }),
      ),
      ruleVersion: 'CostCategoryExpression.v1',
    });
  }
}
