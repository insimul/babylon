/** A single Prolog fact serialized for JSON storage. */
export interface SerializedFact {
  predicate: string;
  args: Array<string | number>;
}
