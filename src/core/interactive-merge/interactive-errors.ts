export class UserAbortError extends Error {
  constructor() {
    super('Aborted by user');
  }
}
