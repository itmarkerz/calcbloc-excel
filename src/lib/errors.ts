/**
 * Errors raised by the add-in logic. The custom-function layer turns them into Excel errors:
 * `invalid` → #VALUE!, everything else → #N/A, each with the message shown in the cell's error tooltip.
 * `setup` means no API key is saved yet: the message says where to get one and where to paste it.
 */
export type ErrorKind = "invalid" | "unavailable" | "limited" | "network" | "setup";

export class CalcBlocError extends Error {
  readonly kind: ErrorKind;
  /** API error code when the API returned one (e.g. unsupported_country, rate_limited). */
  readonly code: string;

  constructor(kind: ErrorKind, code: string, message: string) {
    super(message);
    this.name = "CalcBlocError";
    this.kind = kind;
    this.code = code;
  }
}

export const invalid = (message: string, code = "invalid_parameter") => new CalcBlocError("invalid", code, message);
export const unavailable = (message: string, code = "not_available") => new CalcBlocError("unavailable", code, message);
