

// Ground-Truth Confidence Engine
// Updates alert confidence score based on reporter responses
// 0/3 confirm → drops  |  2/3 confirm → holds  |  3/3 confirm → escalates

const THRESHOLDS = {
  CRITICAL:  0.90,   // escalate, notify government
  HIGH:      0.70,   // maintain high alert
  MODERATE:  0.50,   // monitor
  DISMISS:   0.40,   // drop alert
};

/**
 * Recalculate confidence based on reporter responses
 * Formula: newConfidence = initialConfidence × (1 + weightedResponseFactor)
 * weightedResponseFactor ∈ [-0.5, +0.5]
 */
export function recalculateConfidence(alert) {
  const { initialConfidence, reporterResponses, reportersPinged } = alert;

  const responded = reporterResponses.filter(r => r.response !== 'PENDING');
  const yesCount  = reporterResponses.filter(r => r.response === 'YES').length;
  const noCount   = reporterResponses.filter(r => r.response === 'NO').length;
  const total     = reportersPinged || responded.length || 1;

  // No responses yet — keep initial
  if (responded.length === 0) {
    return {
      confidence: initialConfidence,
      label: getLabel(initialConfidence),
      yesCount: 0,
      noCount: 0,
      responded: 0,
    };
  }

  // Weighted factor: +0.5 max boost for all YES, -0.5 max penalty for all NO
  const responseRatio = (yesCount - noCount) / total;
  const weightedFactor = responseRatio * 0.5;

  let newConfidence = Math.min(1.0, Math.max(0.0, initialConfidence + weightedFactor));

  // Clamp extreme cases
  if (yesCount === total && total >= 2) newConfidence = Math.max(newConfidence, 0.92); // all confirmed → critical
  if (noCount === total && total >= 2)  newConfidence = Math.min(newConfidence, 0.35); // all denied → dismiss

  return {
    confidence: parseFloat(newConfidence.toFixed(3)),
    label: getLabel(newConfidence),
    yesCount,
    noCount,
    responded: responded.length,
  };
}

function getLabel(score) {
  if (score >= THRESHOLDS.CRITICAL)  return 'CRITICAL';
  if (score >= THRESHOLDS.HIGH)      return 'HIGH';
  if (score >= THRESHOLDS.MODERATE)  return 'MODERATE';
  if (score >= THRESHOLDS.DISMISS)   return 'MONITOR';
  return 'LOW';
}

export function shouldEscalate(oldLabel, newLabel) {
  const levels = ['LOW', 'MONITOR', 'MODERATE', 'HIGH', 'CRITICAL'];
  return levels.indexOf(newLabel) > levels.indexOf(oldLabel);
}

export function shouldDismiss(confidence) {
  return confidence < THRESHOLDS.DISMISS;
}

export { THRESHOLDS };