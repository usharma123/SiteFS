export const dangerousPatterns = [
  /delete/i,
  /purchase/i,
  /\bpay\b/i,
  /submit order/i,
  /send/i,
  /publish/i,
  /deploy/i,
  /transfer/i,
  /invite user/i,
  /change password/i,
  /delete account/i
];

export function detectDangerousAction(text: string): string | null {
  const pattern = dangerousPatterns.find((candidate) => candidate.test(text));
  return pattern ? pattern.source.replace(/\\/g, "") : null;
}

