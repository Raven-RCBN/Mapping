import mongoose from "mongoose";
const { Schema } = mongoose;
const options = { versionKey: false, timestamps: true };
const model = (name, shape) =>
  mongoose.models[name] || mongoose.model(name, new Schema(shape, options));
export const Estate = model("MappingEstate", {
  _id: String,
  name: { type: String, required: true },
  location: String,
  totalAreaHa: Number,
  boundary: Schema.Types.Mixed,
  boundaryDate: String,
  source: String,
  qgis: Boolean,
});
export const Asset = model("MappingAsset", {
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
});
Asset.schema.index({ estateId: 1, acquiredAt: 1 });
export const Activity = model("MappingActivity", {
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
export const Source = model("MappingSource", {
  _id: String,
  estateId: { type: String, index: true },
  name: String,
  type: String,
  path: String,
  schedule: String,
  retention: String,
});
export const AccessGrant = model("MappingAccessGrant", {
  _id: String,
  role: { type: String, enum: ["viewer", "manager", "admin"] },
  estateIds: [String],
  active: Boolean,
});
