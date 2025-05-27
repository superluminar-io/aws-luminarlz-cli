import type { Mock } from 'jest-mock';

function normalizeExpectedCalls(expectedCalls: unknown[]): unknown[][] {
  return expectedCalls.map((expectedCall) =>
    Array.isArray(expectedCall) ? [...expectedCall] : [expectedCall],
  );
}

function findMatchingCallIndex(
  allActualCalls: unknown[][],
  expectedArguments: unknown[],
  areValuesEqual: (actualValue: unknown, expectedValue: unknown) => boolean,
): number {
  return allActualCalls.findIndex(
    (actualArguments) =>
      actualArguments.length === expectedArguments.length &&
            actualArguments.every((actualValue, argumentIndex) =>
              areValuesEqual(actualValue, expectedArguments[argumentIndex]),
            ),
  );
}

export function toHaveBeenCalledInOrderWith(
  this: jest.MatcherContext,
  mockFunction: Mock<any>,
  ...expectedCalls: (unknown[] | unknown)[]
) {
  const normalizedExpectedCalls = normalizeExpectedCalls(
    expectedCalls.length === 1 && Array.isArray(expectedCalls[0])
      ? (expectedCalls[0] as unknown[])
      : expectedCalls,
  );

  const allActualCalls: unknown[][] = mockFunction.mock.calls;
  const matchedCallIndices: number[] = [];

  for (const expectedArguments of normalizedExpectedCalls) {
    const matchingCallIndex = findMatchingCallIndex(
      allActualCalls,
      expectedArguments,
      this.equals,
    );

    if (matchingCallIndex === -1) {
      return {
        pass: false,
        message: () =>
          `Expected call with arguments ${this.utils.printExpected(expectedArguments)} not found.\n` +
                    `Actual calls:\n${this.utils.printReceived(allActualCalls)}`,
      };
    }

    matchedCallIndices.push(matchingCallIndex);
  }

  for (let currentIndex = 1; currentIndex < matchedCallIndices.length; currentIndex++) {
    const currentCallIndex = matchedCallIndices[currentIndex];
    const previousCallIndex = matchedCallIndices[currentIndex - 1];

    if (currentCallIndex <= previousCallIndex) {
      return {
        pass: false,
        message: () =>
          'The expected call order was incorrect.\n' +
                    `Expected call #${currentIndex + 1} occurred before expected call #${currentIndex}.`,
      };
    }
  }

  return {
    pass: true,
    message: () =>
      `All ${matchedCallIndices.length} expected calls were found in the correct order.`,
  };
}
