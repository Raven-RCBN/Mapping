export function harvesterIdentity(record) {
  const employeeNo = record.employeeNo?.trim();
  if (employeeNo) return { harvesterNo: employeeNo };
  const employeeName = record.employeeName?.trim();
  return employeeName ? { harvesterName: employeeName } : null;
}

// Offline totals use the complete saved activity set, never the visible map page.
export function harvesterTotal(rows, record, range) {
  const identity = harvesterIdentity(record);
  if (!identity) return null;
  return rows.reduce((total, row) => {
    const date = row.workDate || row.date;
    if (
      row.recordKind !== "harvesting" ||
      row.estateId !== record.estateId ||
      (range && (date < range.start || date >= range.end))
    )
      return total;
    const other = harvesterIdentity(row);
    const same = identity.harvesterNo
      ? other?.harvesterNo === identity.harvesterNo
      : other?.harvesterName === identity.harvesterName;
    return same && Number.isFinite(row.bunches) ? total + row.bunches : total;
  }, 0);
}
