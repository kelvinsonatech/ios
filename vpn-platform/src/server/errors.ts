/** An error whose message is safe and useful to show to the user/administrator. */
export class UserFacingError extends Error {
  constructor(
    message: string,
    readonly code = "USER_ERROR",
  ) {
    super(message);
    this.name = "UserFacingError";
  }
}
