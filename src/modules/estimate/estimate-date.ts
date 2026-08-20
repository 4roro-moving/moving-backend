export function resolveEstimateMoveDate(estimate: {
  moveDate: Date | null;
  estimateRequest: {
    moveDate: Date;
  };
}): Date {
  return estimate.moveDate ?? estimate.estimateRequest.moveDate;
}
