import type { Scenario } from '../types/scenario';

export type RiskVariable = Scenario['risk_model']['vars'][number];
export type RiskValue = string | number | null;

/** Original mock grading: this does not call a prediction service. */
export function gradeVariable(
  variable: RiskVariable,
  value: RiskValue,
): number | null {
  if (value == null || value === '') return null;
  if (variable.mode === 'cat') {
    const index = variable.c?.indexOf(String(value)) ?? -1;
    return index < 0 ? null : index + 1;
  }
  if (variable.mode === 'aspect') {
    const angle = ((Number(value) % 360) + 360) % 360;
    if (angle > 337.5 || angle <= 22.5) return 1;
    if (angle <= 112.5) return 2;
    if (angle > 247.5) return 3;
    if (angle > 167.5 && angle <= 202.5) return 5;
    return 4;
  }
  const number = Number(value);
  for (let index = 0; index < 4; index++) {
    const threshold = variable.t[index];
    if (
      variable.mode === 'le'
        ? number <= threshold
        : variable.mode === 'lt'
          ? number < threshold
          : number > threshold
    )
      return index + 1;
  }
  return 5;
}

export function calculateRisk(
  model: Scenario['risk_model'],
  values: Record<string, RiskValue>,
  missingKeys: string[] = [],
) {
  const missing = new Set(missingKeys);
  const totalWeight = model.vars.reduce((sum, variable) => sum + variable.w, 0);
  const variables = model.vars.map((variable) => {
    const value = missing.has(variable.key)
      ? null
      : (values[variable.key] ?? null);
    return {
      ...variable,
      value,
      grade: gradeVariable(variable, value),
      wn: variable.w / totalWeight,
    };
  });
  const weightedAverage = (items: typeof variables): number | null => {
    const available = items.filter((item) => item.grade != null);
    const weight = available.reduce((sum, item) => sum + item.w, 0);
    return weight
      ? available.reduce((sum, item) => sum + item.w * item.grade, 0) / weight
      : null;
  };
  return {
    score: weightedAverage(variables),
    vars: variables,
    factors: model.axes.map((axis) => {
      const items = variables.filter((variable) => variable.axis === axis.key);
      return {
        key: axis.key,
        name: axis.name,
        weight: items.reduce((sum, variable) => sum + variable.wn, 0),
        score: weightedAverage(items),
        n: items.length,
      };
    }),
    missing: variables
      .filter((variable) => variable.grade == null)
      .map((variable) => variable.name),
  };
}
