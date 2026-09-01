const USER_FIELD_NAMES = Object.freeze([
  "partition",
  "company",
  "project",
  "workContent",
  "subject",
  "deadline"
]);

function validPlan(plan) {
  return Array.isArray(plan) && plan.length > 0 && plan.every((item) =>
    item && typeof item.step === "string" && ["pending", "inProgress", "completed"].includes(item.status)
  );
}

export function projectReadonlyTask(input) {
  const output = {
    threadId: input.threadId,
    runtimeStatus: input.runtimeStatus
  };

  for (const field of USER_FIELD_NAMES) {
    const value = input.userFields?.[field];
    if (typeof value === "string" && value.trim()) output[field] = value.trim();
  }

  if (!validPlan(input.structuredPlan)) return output;
  const currentIndex = input.structuredPlan.findIndex((item) => item.status === "inProgress");
  if (currentIndex < 0) return output;

  output.progress = {
    current: currentIndex + 1,
    total: input.structuredPlan.length,
    label: `${currentIndex + 1} / ${input.structuredPlan.length}`
  };
  const nextPending = input.structuredPlan.slice(currentIndex + 1).find((item) => item.status === "pending");
  if (nextPending) output.nextStep = nextPending.step;
  return output;
}
