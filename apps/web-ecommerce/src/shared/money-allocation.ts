// Allocate an existing whole-VND total without losing a rounding remainder.
// Stable IDs break equal remainders; the sum always equals the original amount.
export function allocateVnd(total: number, lines: { id: number; valueVnd: number }[]) {
  if (!Number.isSafeInteger(total) || total < 0 || !lines.length ||
      new Set(lines.map(line => line.id)).size !== lines.length ||
      lines.some(line => !Number.isSafeInteger(line.id) || line.id < 1 || !Number.isSafeInteger(line.valueVnd) || line.valueVnd < 0))
    throw new Error('Invalid whole-VND allocation.');
  const sum = lines.reduce((value, line) => value + BigInt(line.valueVnd), BigInt(0));
  if (BigInt(total) > sum) throw new Error('Allocation exceeds the original merchandise value.');
  if (sum === BigInt(0)) return new Map(lines.map(line => [line.id, 0]));
  const shares = lines.map(line => {
    const numerator = BigInt(total) * BigInt(line.valueVnd);
    return { id: line.id, amount: Number(numerator / sum), remainder: numerator % sum };
  });
  let remainder = total - shares.reduce((value, line) => value + line.amount, 0);
  shares.sort((a, b) => a.remainder === b.remainder ? a.id - b.id : a.remainder > b.remainder ? -1 : 1);
  for (const line of shares) if (remainder-- > 0) line.amount++;
  return new Map(shares.map(line => [line.id, line.amount]));
}
