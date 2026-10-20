// Splits a whole-VND amount over parcels in proportion to their goods value (largest remainder, ties to the earlier
// parcel), so the parts always add up to the amount exactly. Used for the cash each parcel's courier collects (COD) and
// the value each waybill declares: a parcel refused at the door only loses its own share.
export function splitVnd(totalVnd: number, weights: readonly number[]): number[] {
  if (
    !Number.isSafeInteger(totalVnd) ||
    totalVnd < 0 ||
    !weights.length ||
    weights.some((w) => !Number.isSafeInteger(w) || w < 0)
  )
    throw new Error('Invalid whole-VND split.');
  const sum = weights.reduce((total, w) => total + BigInt(w), BigInt(0));
  // Nothing to weigh by: everything on the first parcel.
  if (sum === BigInt(0)) return weights.map((_, index) => (index === 0 ? totalVnd : 0));
  const shares = weights.map((w, index) => {
    const numerator = BigInt(totalVnd) * BigInt(w);
    return { index, amount: Number(numerator / sum), remainder: numerator % sum };
  });
  let left = totalVnd - shares.reduce((total, share) => total + share.amount, 0);
  for (const share of [...shares].sort((a, b) =>
    a.remainder === b.remainder ? a.index - b.index : a.remainder > b.remainder ? -1 : 1,
  ))
    if (left-- > 0) share.amount++;
  return shares.map((share) => share.amount);
}
