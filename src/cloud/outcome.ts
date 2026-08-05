import type {
  ConnectOutcome,
  ConnectProblem,
  ConnectProblemCode,
} from "@mdbase-dev/connect";

export class PickleConnectOutcomeError extends Error {
  constructor(public readonly problem: ConnectProblem) {
    super(problem.message);
    this.name = "PickleConnectOutcomeError";
  }
}

export function requireConnectOutcome<Value, Code extends ConnectProblemCode>(
  outcome: ConnectOutcome<Value, Code>,
): Value {
  if (!outcome.ok) throw new PickleConnectOutcomeError(outcome.problem);
  return outcome.value;
}

export function connectProblemFromError(error: unknown): ConnectProblem | null {
  if (error instanceof PickleConnectOutcomeError) return error.problem;
  if (!error || typeof error !== "object" || !("problem" in error)) return null;
  const problem = error.problem;
  if (!problem || typeof problem !== "object") return null;
  if (!("code" in problem) || typeof problem.code !== "string") return null;
  if (!("message" in problem) || typeof problem.message !== "string")
    return null;
  return problem as ConnectProblem;
}
