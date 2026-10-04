import test from "node:test";
import assert from "node:assert/strict";
import { harvesterIdentity, harvesterTotal } from "./harvest-popup.js";

test("offline harvester totals span blocks but exclude other workers, estates and dates", () => {
  const record = {
    recordKind: "harvesting",
    estateId: "a",
    employeeNo: "H1",
    employeeName: "Worker",
    date: "2026-07-01",
    bunches: 15,
  };
  const range = { start: "2026-07-01", end: "2026-08-01" };
  const rows = [
    record,
    { ...record, blockId: "another-block", bunches: 25 },
    { ...record, employeeNo: "H2", bunches: 999 },
    { ...record, estateId: "b", bunches: 999 },
    { ...record, date: "2026-06-30", bunches: 999 },
    { ...record, date: "2026-08-01", bunches: 999 },
    { ...record, recordKind: "field", bunches: 999 },
  ];
  assert.equal(harvesterTotal(rows, record, range), 40);
  assert.equal(harvesterTotal(rows, record, null), 2038);
  assert.equal(harvesterTotal([{ ...record, bunches: 0 }], record, range), 0);
  assert.equal(harvesterTotal(rows, { estateId: "a" }, range), null);
});

test("name fallback does not merge named workers with distinct employee numbers", () => {
  const record = {
    recordKind: "harvesting",
    estateId: "a",
    employeeName: "Worker",
    date: "2026-07-01",
    bunches: 10,
  };
  assert.deepEqual(harvesterIdentity(record), { harvesterName: "Worker" });
  assert.equal(
    harvesterTotal(
      [record, { ...record, employeeNo: "H2", bunches: 100 }],
      record,
      null
    ),
    10
  );
});
