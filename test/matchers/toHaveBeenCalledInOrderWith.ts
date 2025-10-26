import Mock = jest.Mock;

export function toHaveBeenCalledInOrderWith(
  this: jest.MatcherContext,
  received: Mock<any, any>,
  ...expectedCalls: (any[] | any)[]
) {
  const flattenedExpected =
        expectedCalls.length === 1 && Array.isArray(expectedCalls[0])
          ? (expectedCalls[0] as any[])
          : expectedCalls;

  const calls: unknown[][] = received.mock.calls;
  const foundIndices: number[] = [];

  for (const expected of flattenedExpected) {
    const expectedArgs = Array.isArray(expected) ? expected : [expected];
    const foundIndex = calls.findIndex(
      (call: unknown[]) =>
        call.length === expectedArgs.length &&
                call.every((arg, j) => this.equals(arg, expectedArgs[j])),
    );

    if (foundIndex === -1) {
      return {
        pass: false,
        message: () =>
          `Expected call with arguments ${this.utils.printExpected(expectedArgs)} not found.`,
      };
    }

    foundIndices.push(foundIndex);
  }

  const isOrdered = foundIndices.every((v, i) => i === 0 || v > foundIndices[i - 1]);
  if (!isOrdered) {
    const wrongIdx = foundIndices.findIndex((v, i) => i > 0 && v < foundIndices[i - 1]);
    const previous = wrongIdx - 1;

    return {
      pass: false,
      message: () =>
        'The order of your expected calls did not match the actual call order.\n' +
                `Expected-call #${wrongIdx + 1} was invoked before expected-call #${previous + 1}.`,
    };
  }

  return {
    pass: true,
    message: () => `All expected calls were found in the correct order (${foundIndices.length} calls).`,
  };
}