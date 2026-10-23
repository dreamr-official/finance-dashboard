export interface PlaidAccountCandidate {
  mask: string | null;
  connectionId: string | null;
  institutionName: string;
}

export function findDuplicateLinkedAccount(
  institutionName: string | null | undefined,
  incomingMasks: readonly (string | null | undefined)[],
  existingAccounts: readonly PlaidAccountCandidate[],
) {
  if (!institutionName) return null;
  const masks = new Set(incomingMasks.filter((mask): mask is string => Boolean(mask)));
  if (!masks.size) return null;
  return (
    existingAccounts.find(
      (account) =>
        account.connectionId !== null &&
        account.institutionName === institutionName &&
        account.mask !== null &&
        masks.has(account.mask),
    ) ?? null
  );
}
