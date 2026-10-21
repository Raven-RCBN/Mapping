import {estateCurrency} from './estate-currency.js';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

export const OBAN_ESTATE_ID = 'f7b09538-fd0c-4ac3-b3ba-b6bf90e400ae';
const hash = value => createHash('sha256').update(value).digest('hex');
const key = (prefix, values) => prefix + hash(JSON.stringify(values)).slice(0, 40);
const minor = value => {
  assert.ok(typeof value === 'number' && Number.isFinite(value), 'A source amount is missing');
  const n = Math.round(value * 100);
  assert.ok(Number.isSafeInteger(n) && Math.abs(n / 100 - value) < 0.000001, 'Amounts require at most two decimal places');
  return n;
};
export function prepareVehicleImport(dataset, estateId) {
  const meta = dataset.metadata;
  // This adapter is deliberately scoped to the reviewed OBAN report.
  assert.equal(estateId, OBAN_ESTATE_ID, 'This HTS import belongs only to OBAN');
  assert.equal(meta.company, 'JB FARMS OBAN');
  assert.equal(meta.branch, 'PLANTATION');
  assert.equal(meta.report_filter_start, '2025-01-01');
  assert.equal(meta.report_filter_end, '2025-12-31');
  assert.equal(meta.currency, 'NGN');
  assert.match(meta.source_sha256, /^[a-f0-9]{64}$/);
  const sourceSystem = 'hts-vehicle-analysis';
  const importId = key('vi-', [estateId, sourceSystem, meta.company, meta.branch, meta.report_filter_start, meta.report_filter_end]);
  const vehicles = [], transactions = [], headers = [];
  for (const v of dataset.vehicles) {
    const vehicleId = key('vh-', [estateId, sourceSystem, v.vehicle_id_source ? ['identifier', v.vehicle_id_source] : ['label', v.vehicle_label_source]]);
    vehicles.push({ _id: vehicleId, estateId, name: v.vehicle_label_source,
      sourceIdentifier: v.vehicle_id_source, sourceLabel: v.vehicle_label_source,
      identityStatus: v.label_appears_truncated ? 'truncated_label' : 'source_identifier',
      sourceSystem, company: meta.company, branch: meta.branch });
    const amountMinor = minor(v.reported_amount_ngn);
    headers.push({ vehicleId, reportSequence: v.report_sequence, sourceLabel: v.vehicle_label_source,
      amountMinor, transactionCount: v.transactions.length });
    let total = 0;
    const sequences = new Set();
    for (const r of v.transactions) {
      assert.equal(r.vehicle_key, v.vehicle_key);
      assert.equal(r.vehicle_report_sequence, v.report_sequence);
      assert.equal(r.vehicle_label_source, v.vehicle_label_source);
      assert.equal(r.vehicle_id_source, v.vehicle_id_source);
      assert.equal(r.currency, 'NGN');
      assert.ok(r.transaction_date >= meta.report_filter_start && r.transaction_date <= meta.report_filter_end);
      assert.equal(new Date(r.transaction_date).toISOString().slice(0, 10), r.transaction_date);
      assert.ok(r.category && r.subcategory && r.item_name);
      assert.ok(!sequences.has(r.transaction_sequence)); sequences.add(r.transaction_sequence);
      const sourceKey = `${meta.report_filter_start}/${meta.report_filter_end}/${r.record_key}`;
      const amount = minor(r.amount_ngn); total += amount;
      transactions.push({
        _id: key('vt-', [estateId, sourceSystem, sourceKey]), estateId, vehicleId, importId,
        year: 2025, date: r.transaction_date, month: r.transaction_date.slice(0, 7), currency: 'NGN', amountMinor: amount,
        transactionNo: r.transaction_no, transactionSequence: r.transaction_sequence,
        transactionType: r.transaction_type, expenseType: r.expense_type, description: r.description_source, employee: r.employee_source,
        category: r.category, subcategory: r.subcategory, itemName: r.item_name,
        quantity: r.quantity_in_description ?? null, quantityUnit: r.quantity_unit ?? null, quantityUnitSource: r.quantity_unit_source ?? null,
        unitPriceMinor: r.unit_price_in_description_ngn == null ? null : minor(r.unit_price_in_description_ngn),
        sourceSystem, sourceKey, sourceLine: r.source_line, sourceVehicleKey: v.vehicle_key,
        sourceVehicleLabel: v.vehicle_label_source, reportSequence: v.report_sequence,
        sourceHash: meta.source_sha256, classificationRule: r.classification_rule,
        reviewFlags: r.review_flags ? r.review_flags.split('; ').filter(Boolean) : [],
      });
    }
    assert.deepEqual([...sequences].sort((a, b) => a - b), Array.from({length:v.transactions.length}, (_, i) => i + 1));
    assert.equal(total, amountMinor, `Vehicle ${v.report_sequence} does not reconcile`);
  }
  assert.deepEqual(headers.map(h=>h.reportSequence).sort((a,b)=>a-b), Array.from({length:77},(_,i)=>i+1));
  assert.equal(vehicles.length, 77); assert.equal(transactions.length, 1038);
  assert.equal(new Set(vehicles.map(v => v._id)).size, vehicles.length);
  assert.equal(new Set(transactions.map(r => r._id)).size, transactions.length);
  const amountMinor = transactions.reduce((n, r) => n + r.amountMinor, 0);
  assert.equal(amountMinor, 2300108650); assert.equal(amountMinor, minor(meta.transaction_total_ngn));
  assert.equal(amountMinor, minor(meta.vehicle_reported_total_ngn));
  return { vehicles, transactions, report: {
    _id: importId, estateId, year: 2025, company: meta.company, branch: meta.branch,
    report: meta.report, sourceSystem, periodStart: meta.report_filter_start, periodEnd: meta.report_filter_end,
    currency: 'NGN', sourceHash: meta.source_sha256, contentHash: hash(JSON.stringify(dataset)),
    sourceFile: meta.source_file, capturedAt: meta.capture_date_local,
    captureMethod: meta.source_method, classificationVersion: meta.organization.classification_version,
    vehicleCount: vehicles.length, transactionCount: transactions.length, amountMinor, headers,
  }};
}
export async function importVehicleDataset(models, dataset, { estateId, apply = false, sourcePath = null, importedBy = 'authorized-import' }) {
  const prepared = prepareVehicleImport(dataset, estateId);
  assert.ok(await models.Estate.exists({_id:estateId}), 'OBAN estate not found');
  const {report, vehicles, transactions} = prepared;
  const configured=await estateCurrency(models.Estate,estateId,[models.VehicleImport,models.VehicleTransaction]);
  assert.ok(!configured||configured===report.currency,'Vehicle source currency differs from estate setup');
  // Check the entire batch before any write. A new/changed snapshot for the same
  // year requires explicit reconciliation; it cannot silently replace or double costs.
  const existingImport = await models.VehicleImport.findById(report._id).lean();
  if (existingImport) {
    assert.equal(existingImport.contentHash, report.contentHash, 'A different OBAN 2025 vehicle snapshot already exists');
    assert.equal(existingImport.sourceHash, report.sourceHash);
  }
  const counts = {};
  for (const [name, records] of [['Vehicle', vehicles], ['VehicleTransaction', transactions]]) {
    for (const record of records) await new models[name](record).validate();
    const existing = await models[name].find({_id:{$in:records.map(r=>r._id)}}).lean();
    const found = new Map(existing.map(r=>[r._id,r])); counts[name] = existing.length;
    for (const record of records) if (found.has(record._id)) {
      for (const [field, value] of Object.entries(record))
        assert.deepEqual(found.get(record._id)[field], value, `Existing ${name} differs: ${record._id} / ${field}`);
    }
  }
  const totalExisting = await models.VehicleTransaction.countDocuments({estateId, importId:report._id});
  assert.equal(totalExisting, counts.VehicleTransaction, 'Unexpected transaction rows in this import');
  if (apply) {
    await Promise.all(['Vehicle','VehicleTransaction','VehicleImport','VehicleUsage'].map(n=>models[n].createIndexes()));
    await models.VehicleImport.updateOne({_id:report._id}, {$setOnInsert:{...report, status:'staging', sourcePath, importedBy}}, {upsert:true});
    for (const [name, records] of [['Vehicle', vehicles], ['VehicleTransaction', transactions]])
      await models[name].bulkWrite(records.map(record=>({updateOne:{filter:{_id:record._id},update:{$setOnInsert:record},upsert:true,timestamps:false}})));
    const actual = await models.VehicleTransaction.aggregate([{$match:{estateId,importId:report._id}},{$group:{_id:'$vehicleId',count:{$sum:1},amountMinor:{$sum:'$amountMinor'}}}]);
    assert.equal(actual.length, headersCount(report));
    for (const header of report.headers) {
      const row = actual.find(a=>a._id === header.vehicleId);
      assert.equal(row?.count, header.transactionCount); assert.equal(row?.amountMinor, header.amountMinor);
    }
    if (existingImport?.status !== 'complete') await models.VehicleImport.updateOne({_id:report._id}, {$set:{status:'complete',completedAt:new Date()}});
  }
  return { mode:apply?'applied':'dry-run', estateId, importId:report._id,
    vehicles:vehicles.length, transactions:transactions.length, amountMinor:report.amountMinor,
    newVehicles:vehicles.length-counts.Vehicle, newTransactions:transactions.length-counts.VehicleTransaction };
}
const headersCount = report => report.headers.length;
