export type ErrorResponse = {
    error: AppError;
};

export type AppError =
    | {
          code: 'REQUIREMENT_NOT_MET';
          message: string;
          proteinGoal: number;
          maximumProteinPercentage: number;
      }
    | {
          code: 'UNKNOWN_ERROR';
          message: string;
      };

export type AiClient = {
    generate: (prompt: string) => Promise<string>;
};
