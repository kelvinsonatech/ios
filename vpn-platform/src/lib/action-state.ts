/** Shape returned by Server Actions used with useActionState. */
export type ActionState = {
  ok?: boolean;
  message?: string;
  error?: string;
  fieldErrors?: Record<string, string[] | undefined>;
  /** Extra payload for the client (never secrets, except one-time values explicitly shown once). */
  data?: Record<string, unknown>;
};

export const initialActionState: ActionState = {};
