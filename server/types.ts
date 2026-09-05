export type ProteinFeasibilityResult =
    | {
          feasible: true;
      }
    | {
          feasible: false;
          maximumProteinPercentage: number;
      };
