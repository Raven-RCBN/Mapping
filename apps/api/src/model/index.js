import mongoose from "mongoose";
const { Schema } = mongoose;
const options = { versionKey: false, timestamps: true };
const ensureIndex = (model, keys, options) => {
  if (
    !model.schema
      .indexes()
      .some(([index]) => JSON.stringify(index) === JSON.stringify(keys))
  )
    model.schema.index(keys, options);
};
export function createModels(connection = mongoose, prefix = "Mapping") {
  const model = (name, shape) => {
    name = name.replace(/^Mapping/, prefix);
    return (
      connection.models[name] ||
      connection.model(name, new Schema(shape, options))
    );
  };
  const Estate = model("MappingEstate", {
    _id: String,
    name: { type: String, required: true },
    location: String,
    totalAreaHa: Number,
    boundary: Schema.Types.Mixed,
    boundaryDate: String,
    source: String,
    qgis: Boolean,
    workbookImportId: String,
  });
  const Asset = model("MappingAsset", {
    _id: String,
    estateId: { type: String, required: true, index: true },
    name: String,
    kind: {
      type: String,
      enum: [
        "imagery",
        "terrain",
        "hillshade",
        "slope",
        "contours",
        "elevation-grid",
        "qgis",
      ],
      required: true,
    },
    acquiredAt: String,
    importedAt: String,
    bounds: [[Number]],
    file: { path: String, mime: String, bytes: Number, sha256: String },
    cloudPercent: Number,
    resolution: Number,
    attribution: String,
    sourceUrl: String,
    storageState: {
      type: String,
      enum: ["active", "retired", "purging", "purged"],
      default: "active",
    },
    retiredAt: Date,
    retiredBy: String,
    purgedAt: Date,
    purgedBy: String,
  });
  ensureIndex(Asset, { estateId: 1, acquiredAt: 1 });
  ensureIndex(Asset, { estateId: 1, kind: 1, acquiredAt: -1, _id: -1 });
  ensureIndex(Asset, { estateId: 1, storageState: 1, retiredAt: 1, _id: 1 });
  ensureIndex(Asset, { "file.path": 1 });
  const Activity = model("MappingActivity", {
    _id: String,
    estateId: { type: String, index: true },
    block: String,
    type: String,
    date: { type: String, index: true },
    observed_at: String,
    time: String,
    value: Number,
    quantity: String,
    note: String,
    status: String,
    verifiedBy: String,
    verifiedAt: Date,
  });
  const Source = model("MappingSource", {
    _id: String,
    estateId: { type: String, index: true },
    name: String,
    type: String,
    path: String,
    schedule: String,
    retention: String,
  });
  ensureIndex(Activity, { estateId: 1, date: -1, _id: -1 });
  const AccessGrant = model("MappingAccessGrant", {
    _id: String,
    role: { type: String, enum: ["viewer", "manager", "admin"] },
    estateIds: [String],
    active: Boolean,
  });

  const point = new Schema(
    {
      type: { type: String, enum: ["Point"], required: true },
      coordinates: {
        type: [Number],
        required: true,
        validate: {
          validator: (c) =>
            c.length === 2 &&
            c.every(Number.isFinite) &&
            Math.abs(c[0]) <= 180 &&
            Math.abs(c[1]) <= 90,
          message: "Use [longitude, latitude] in WGS 84",
        },
      },
      accuracyMetres: { type: Number, min: 0 },
    },
    { _id: false }
  );
  const provenance = {
    sourceFile: String,
    sourceSheet: String,
    sourceRow: Number,
    importId: String,
  };
  const Block = model("MappingBlock", {
    _id: String,
    estateId: { type: String, required: true, index: true },
    blockCode: { type: String, required: true },
    plantingYear: String,
    plantingYearDescription: String,
    blockStatus: String,
    plantedHectares: Number,
    plantedDate: String,
    plantingMaterial: String,
    soilType: String,
    mapBlockNames: [String],
    mapLinkMethod: String,
    ...provenance,
  });
  ensureIndex(Block, { estateId: 1, blockCode: 1 }, { unique: true });
  ensureIndex(Block, { estateId: 1, blockCode: -1, _id: -1 });
  const activityFields = {
    _id: String,
    estateId: { type: String, required: true, index: true },
    blockId: { type: String, default: null },
    blockCode: { type: String, default: null },
    workDate: { type: String, required: true, index: true },
    gang: String,
    geolocation: { type: point, default: null },
    status: { type: String, default: "recorded" },
    verifiedBy: String,
    verifiedAt: Date,
    locationUpdatedBy: String,
    locationUpdatedAt: Date,
    ...provenance,
  };
  const HarvestingActivity = model("MappingHarvestingActivity", {
    ...activityFields,
    employeeNo: String,
    employeeName: String,
    activity: String,
    bunches: { type: Number, required: true, min: 0 },
  });
  const FieldActivity = model("MappingFieldActivity", {
    ...activityFields,
    activityCode: String,
    activityDescription: String,
    mandays: { type: Number, required: true, min: 0 },
  });
  for (const m of [HarvestingActivity, FieldActivity]) {
    ensureIndex(m, { estateId: 1, blockId: 1, workDate: 1 });
    ensureIndex(m, { estateId: 1, workDate: -1, _id: -1 });
    ensureIndex(m, { estateId: 1, blockId: 1, workDate: -1, _id: -1 });
    ensureIndex(m, { estateId: 1, blockCode: 1, workDate: -1, _id: -1 });
    ensureIndex(m, { estateId: 1, status: 1, workDate: -1, _id: -1 });
  }
  ensureIndex(FieldActivity, {
    estateId: 1,
    activityDescription: 1,
    workDate: -1,
    _id: -1,
  });
  return {
    Estate,
    Asset,
    Activity,
    Source,
    AccessGrant,
    Block,
    HarvestingActivity,
    FieldActivity,
  };
}
export const {
  Estate,
  Asset,
  Activity,
  Source,
  AccessGrant,
  Block,
  HarvestingActivity,
  FieldActivity,
} = createModels();
