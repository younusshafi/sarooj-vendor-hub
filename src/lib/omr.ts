/**
 * Single source of truth for displaying OMR money amounts.
 *
 * OMR has up to 3 decimals (1 rial = 1000 baisa). We show MEANINGFUL decimals only —
 * trailing zeros are trimmed so the column reads cleanly:
 *   230000    -> "230,000"
 *   1158.5    -> "1,158.5"
 *   1158.535  -> "1,158.535"
 *
 * Note: this is DISPLAY only. Money is still computed at full precision and rounded to
 * 3 dp before it reaches here (the VAT rule: full-precision subtotal -> round finals 3dp
 * -> total = subtotal + VAT). See CLAUDE.md "OMR / VAT".
 *
 * Use this everywhere an OMR amount is shown — do not hand-roll toLocaleString with fixed
 * fraction digits, or the display will drift between screens.
 */
export function fmtOmr(n: number): string {
  return n.toLocaleString("en", { minimumFractionDigits: 0, maximumFractionDigits: 3 });
}
