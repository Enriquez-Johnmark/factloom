/** Where new information came from, as a caller gives it. */
export type SourceInput = {
  readonly kind: string;
  readonly locator: string | null;
  readonly version: string | null;
};
