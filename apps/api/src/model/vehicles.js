// Vehicle costs and operational usage have different grains. Usage is never
// duplicated onto expense lines or inferred from a parts/fuel requisition.
export function createVehicleModels(model, Schema, ensureIndex) {
  const scope = { type: String, required: true, index: true };
  const minor = { type: Number, required: true, validate: Number.isSafeInteger };
  const nullableMeasure = { type: Number, min: 0, default: null, validate: v => v == null || Number.isFinite(v) };
  const Vehicle = model('MappingVehicle', {
    _id: String, estateId: scope, name: { type: String, required: true },
    sourceIdentifier: { type: String, default: null },
    sourceLabel: { type: String, required: true }, sourceSystem: String,
    identityStatus: { type: String, enum: ['source_identifier', 'truncated_label'], required: true },
    company: String, branch: String,
  });
  ensureIndex(Vehicle, { estateId: 1, sourceSystem: 1, sourceIdentifier: 1 });
  const VehicleImport = model('MappingVehicleImport', {
    _id: String, estateId: scope, year: { type: Number, required: true },
    status: { type: String, enum: ['staging', 'complete'], default: 'staging' },
    company: String, branch: String, report: String, sourceSystem: String,
    periodStart: String, periodEnd: String, currency: { type: String, enum: ['NGN'], required: true },
    sourceHash: String, contentHash: String, sourceFile: String, sourcePath: String,
    capturedAt: String, captureMethod: String, classificationVersion: String,
    vehicleCount: Number, transactionCount: Number, amountMinor: minor,
    headers: [{ _id: false, vehicleId: String, reportSequence: Number,
      sourceLabel: String, amountMinor: Number, transactionCount: Number }],
    importedBy: String, completedAt: Date,
  });
  ensureIndex(VehicleImport, { estateId: 1, sourceSystem: 1, company: 1, branch: 1, periodStart: 1, periodEnd: 1 }, { unique: true });
  ensureIndex(VehicleImport, { estateId: 1, year: 1, status: 1 });
  const VehicleTransaction = model('MappingVehicleTransaction', {
    _id: String, estateId: scope, vehicleId: { type: String, required: true },
    importId: { type: String, required: true }, year: { type: Number, required: true },
    date: { type: String, required: true }, month: String, currency: { type: String, enum: ['NGN'], required: true },
    amountMinor: minor, transactionNo: String, transactionSequence: Number,
    transactionType: String, expenseType: String, description: String, employee: String,
    category: String, subcategory: String, itemName: String,
    quantity: nullableMeasure, quantityUnit: { type: String, default: null },
    quantityUnitSource: { type: String, default: null }, unitPriceMinor: { type: Number, default: null },
    sourceSystem: String, sourceKey: { type: String, required: true }, sourceLine: Number,
    sourceVehicleKey: String, sourceVehicleLabel: String, reportSequence: Number,
    sourceHash: String, classificationRule: String, reviewFlags: [String],
  });
  ensureIndex(VehicleTransaction, { estateId: 1, sourceSystem: 1, sourceKey: 1 }, { unique: true });
  ensureIndex(VehicleTransaction, { estateId: 1, year: 1, vehicleId: 1, date: -1, _id: 1 });
  ensureIndex(VehicleTransaction, { estateId: 1, importId: 1, category: 1, month: 1 });
  const VehicleUsage = model('MappingVehicleUsage', {
    _id: String, estateId: scope, vehicleId: { type: String, required: true },
    workDate: { type: String, required: true },
    task: { type: String, default: null }, activityCode: { type: String, default: null },
    activityDescription: { type: String, required: true },
    activityId: { type: String, default: null }, activityKind: { type: String, enum: ['field', 'harvesting', 'other', null], default: null },
    blockCode: { type: String, default: null },
    runningHours: nullableMeasure, distanceKm: nullableMeasure,
    hourMeterStart: nullableMeasure, hourMeterEnd: nullableMeasure,
    odometerStartKm: nullableMeasure, odometerEndKm: nullableMeasure,
    sourceSystem: { type: String, required: true }, sourceKey: { type: String, required: true },
    note: String, revision: { type: Number, default: 0 }, updatedBy: String,
  });
  VehicleUsage.schema.path('runningHours').validate(function () {
    return this.runningHours != null || this.distanceKm != null;
  }, 'Supply running hours or distance; missing is not zero.');
  VehicleUsage.schema.path('workDate').validate(value => /^\d{4}-\d{2}-\d{2}$/.test(value || '') &&
    Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value, 'Use a valid date.');
  for (const [start, end] of [['hourMeterStart', 'hourMeterEnd'], ['odometerStartKm', 'odometerEndKm']])
    VehicleUsage.schema.path(end).validate(function (value) {
      return this[start] == null || value == null || value >= this[start];
    }, 'End reading must not be below start reading.');
  ensureIndex(VehicleUsage, { estateId: 1, sourceSystem: 1, sourceKey: 1 }, { unique: true });
  ensureIndex(VehicleUsage, { estateId: 1, vehicleId: 1, workDate: 1 });
  ensureIndex(VehicleUsage, { estateId: 1, activityCode: 1, workDate: 1 });
  ensureIndex(VehicleTransaction,{estateId:1,year:1,date:1,_id:1});
  ensureIndex(VehicleTransaction,{estateId:1,year:1,vehicleId:1,date:1,_id:1});
  ensureIndex(VehicleUsage,{estateId:1,workDate:-1,_id:1});
  return { Vehicle, VehicleImport, VehicleTransaction, VehicleUsage };
}
