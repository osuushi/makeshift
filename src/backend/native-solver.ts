import { NativeCalculator } from "./native-calculator.js";
import type { SolverInput, SolverResult } from "./solver-input.js";

export class NativeSolver extends NativeCalculator<SolverInput, SolverResult> {
  constructor(executable = ".build/solver/bin/makeshift-solver") {
    super(executable, "Sketch solver");
  }
  solve(input: SolverInput): Promise<SolverResult> {
    return this.calculate(input);
  }
}
