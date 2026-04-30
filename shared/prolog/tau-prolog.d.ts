/**
 * Type declarations for tau-prolog
 *
 * tau-prolog doesn't ship types, so we declare the subset we use.
 */
declare module 'tau-prolog' {
  interface Session {
    consult(program: string, options: {
      success: () => void;
      error: (err: any) => void;
    }): void;

    query(goal: string, options: {
      success: () => void;
      error: (err: any) => void;
    }): void;

    answer(callback: {
      success: (answer: any) => void;
      fail: () => void;
      error: (err: any) => void;
      limit: () => void;
    }): void;

    answers(callback: (answer: any) => void): void;

    limit: number;
  }

  interface TauProlog {
    create(limit?: number): Session;
    format_answer(answer: any): string;
  }

  const pl: TauProlog;
  export default pl;
}

declare module 'tau-prolog/modules/lists.js' {
  const loadLists: (pl: any) => void;
  export default loadLists;
}
