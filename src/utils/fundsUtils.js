const MIS_MARGIN_RATE = 0.2;

const lotsAffordableFromBalance = (balance, marginPerLot) => {
  const m = parseFloat(marginPerLot) || 0;
  if (m <= 0) return 0;
  return Math.max(0, Math.floor(parseFloat(balance) / m));
};

const enrichLedgerRow = (row, marginPerLotRef) => {
  const bal = parseFloat(row.balance_after) || 0;
  const amt = parseFloat(row.amount) || 0;
  const type = row.type;
  const balanceBefore =
    type === 'credit' ? bal - amt : type === 'debit' ? bal + amt : bal;

  return {
    ...row,
    balanceBefore: parseFloat(balanceBefore.toFixed(2)),
    balanceAfter: bal,
    lotsAffordableBefore: lotsAffordableFromBalance(balanceBefore, marginPerLotRef),
    lotsAffordableAfter: lotsAffordableFromBalance(bal, marginPerLotRef),
    isMarginRelated: /margin|MIS/i.test(row.description || '')
  };
};

const buildMarginSnapshot = ({
  cashBalance,
  usedMargin,
  collateralValue,
  startBalance
}) => {
  const cash = parseFloat(cashBalance) || 0;
  const used = parseFloat(usedMargin) || 0;
  const collateral = parseFloat(collateralValue) || 0;
  const pool = cash + used;
  const marginUtilizationPercent =
    pool > 0 ? parseFloat(((used / pool) * 100).toFixed(2)) : 0;
  const availableMargin = parseFloat(Math.max(0, cash).toFixed(2));
  const lowMarginAlert = marginUtilizationPercent >= 80 || (startBalance > 0 && cash < startBalance * 0.05);

  return {
    cashBalance: cash,
    availableCash: cash,
    usedMargin: parseFloat(used.toFixed(2)),
    availableMargin,
    collateralValue: parseFloat(collateral.toFixed(2)),
    collateralMargin: parseFloat(collateral.toFixed(2)),
    marginUtilizationPercent,
    lowMarginAlert,
    misMarginRate: MIS_MARGIN_RATE,
    marginPerLotHint: null
  };
};

module.exports = {
  MIS_MARGIN_RATE,
  lotsAffordableFromBalance,
  enrichLedgerRow,
  buildMarginSnapshot
};
