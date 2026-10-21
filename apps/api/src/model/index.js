import {createOperationModels} from './operations.js';
import mongoose from "mongoose";
import {currencyCodes} from "../../../../packages/shared/currency.js";
import { createVehicleModels } from './vehicles.js';
import { createTrialBalanceModels } from './trial-balance.js';
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
    nameKey: { type: String, unique: true, sparse: true },
    location: String,
    currency: {type:String,enum:currencyCodes},
    currencyUpdatedAt: Date, currencyUpdatedBy:String, currencyHistory:[Schema.Types.Mixed],
    totalAreaHa: Number,
    boundary: Schema.Types.Mixed,
    boundaryDate: String,
    source: String,
    qgis: Boolean,
    workbookImportId: String,
    gisImportId: String,
  });
  const Asset = model("MappingAsset", {
    _id: String,
    estateId: { type: String, required: true, index: true },
    name: String,
    kind: {
      type: String,
      enum: [
        "imagery",
        "reference-image",
        "terrain",
        "hillshade",
        "slope",
        "contours",
        "elevation-grid",
        "qgis",
        "vector",
      ],
      required: true,
    },
    acquiredAt: String,
    importedAt: String,
    bounds: [[Number]],
    file: { path: String, mime: String, bytes: Number, sha256: String },
    mosaic: {
      path: String, sha256: String, bytes: Number, dataOffset: Number,
      levels: [{ _id: false, cols: Number, rows: Number, indexOffset: Number,
        xmin: Number, ymin: Number, xmax: Number, ymax: Number }],
    },
    cloudPercent: Number,
    resolution: Number,
    attribution: String,
    sourceUrl: String,
    layerType: {
      type: String,
      enum: [
        "land-use",
        "rivers",
        "river-lines",
        "roads",
        "road-lines",
        "buildings",
        "poi",
      ],
    },
    featureCount: Number,
    storageState: {
      type: String,
      enum: ["active", "retired", "purging", "purged", "restoring"],
      default: "active",
    },
    archiveId: String,
    restoreOperation: String,
    restoreStartedAt: Date,
    restoredAt: Date,
    restoredBy: String,
    retiredAt: Date,
    retiredBy: String,
    purgedAt: Date,
    purgedBy: String,
  });
  ensureIndex(Asset, { estateId: 1, acquiredAt: 1 });
  ensureIndex(Asset, { estateId: 1, kind: 1, acquiredAt: -1, _id: -1 });
  ensureIndex(Asset, { estateId: 1, storageState: 1, retiredAt: 1, _id: 1 });
  ensureIndex(Asset, { "file.path": 1 });
  const Archive = model("MappingArchive", {
    _id: String, estateId: { type: String, required: true, index: true },
    status: { type: String, enum: ["building", "ready", "verifying", "verified", "failed"], required: true },
    active: { type: Boolean, default: false }, heartbeatAt: Date,
    createdBy: String, verifiedAt: Date, manifestHash: String,
    files: Number, bytes: Number, records: Number, error: String,
  });
  ensureIndex(Archive, { estateId: 1 }, { unique: true, partialFilterExpression: { active: true } });
  ensureIndex(Archive, { estateId: 1, createdAt: -1 });
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
    profileVersion:String, connectionDetails:String, extractionMethod:String, reviewNotes:String,
    updatedBy:String, detailsRevision:{type:Number,default:0}, detailsHistory:[Schema.Types.Mixed],
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
    sourceSql:Schema.Types.Mixed,pdfSurveyAreaHa:Number,palmCountSource:String,metricSource:String,referenceHa:Number,referenceDate:String,
    blockStatus: String,
    plantedHectares: Number,
    plantedDate: String,
    plantingMaterial: String,
    soilType: String,
    cropType: String, plantingMaterialType: String, replantingPlans: [Schema.Types.Mixed],
    highlight: Boolean, issues: [String],
    gisAreaHa: Number,
    totalPalms: Number,
    palmsPerHectare: Number,
    surveyDate: String,
    division: String,
    gpsAreaHa: Number,
    sourceYieldLastYear: Number,
    sourceYieldTwoYears: Number,
    mapBlockNames: [String],
    mapLinkMethod: String,
    ...provenance,
  });
  ensureIndex(Block, { estateId: 1, blockCode: 1 }, { unique: true });
  ensureIndex(Block, { estateId: 1, blockCode: -1, _id: -1 });
  const ProductionName = model("MappingProductionName", {
    _id: String, estateId: {type:String,required:true,index:true},
    sourceBlockCode: {type:String,required:true}, division:String, sourceSqlBlockId:String, assumption:String,
    mapBlockCode: {type:String,default:null}, linkMethod:String,
    firstMonth:String, lastMonth:String, note:String,
    revision:{type:Number,default:0}, updatedBy:String, history:[Schema.Types.Mixed],
  });
  ensureIndex(ProductionName,{estateId:1,sourceBlockCode:1,division:1},{unique:true});
  const ProductionComment = model("MappingProductionComment", {
    _id:String,estateId:{type:String,required:true,index:true},sourceBlockId:{type:String,required:true},
    year:{type:Number,required:true},comment:{type:String,required:true},sourceSystem:String,sourceHash:String,sourceCell:String,...provenance,
    revision:{type:Number,default:0},updatedBy:String,history:[Schema.Types.Mixed],
  });
  ensureIndex(ProductionComment,{estateId:1,sourceBlockId:1,year:1},{unique:true});
  const MonthlyProduction = model("MappingMonthlyProduction", {
    _id:String, estateId:{type:String,required:true,index:true},
    sourceBlockId:{type:String,required:true}, month:{type:String,required:true},
    receiptStatus:{type:String,enum:['received','not_received','unavailable'],required:true},
    metricSource:String,allocationBasis:String,ffbMt:Number,looseFruitMt:Number,totalCropMt:Number,ownMt:Number,contractorMt:Number,partial:Boolean,coverageMonths:[String],
    mt:Number,bunches:Number,workbookPalms:Number,gpsHa:Number,effectiveHa:Number,yieldAreaHa:Number,
    sourceAbw:Number,sourceYield:Number,sourceBunchesHa:Number,sourceBunchesPalm:Number,harvestingDays:Number,plantingYear:String,
    parameterNote:String,note:String,sourceSystem:String,sourceKey:String,sourceHash:String,
    sourceCells:Schema.Types.Mixed,issues:[String],...provenance,
    revision:{type:Number,default:0},updatedBy:String,history:[Schema.Types.Mixed],
  });
  ensureIndex(MonthlyProduction,{estateId:1,sourceBlockId:1,month:1},{unique:true});
  ensureIndex(MonthlyProduction,{estateId:1,month:-1});
  const YearlyProduction = model("MappingYearlyProduction", {
    ...MonthlyProduction.schema.obj, year:{type:Number,required:true}, periodLabel:String,
  });
  ensureIndex(YearlyProduction,{estateId:1,sourceBlockId:1,year:1},{unique:true});
  const Wage = model("MappingWage", {
    _id: String, estateId: {type:String,required:true,index:true},
    basis: {type:String,enum:['monthly','annual_summary'],required:true},
    period: {type:String,required:true}, division: {type:String,required:true},
    task: {type:String,required:true}, activity: {type:String,required:true},
    sourceBlockCode: {type:String,default:null}, mapBlockCode: {type:String,default:null},
    amountMinor: {type:Number,required:true}, currency: {type:String,enum:currencyCodes,required:true},
    sourceSystem: {type:String,required:true}, sourceKey: {type:String,required:true},
    sourceDivision:String, sourceSerial:String, sourceCell:String, sourceHash:String,
    ...provenance, note:String, revision:{type:Number,default:0}, updatedBy:String,
    history:[Schema.Types.Mixed],
  });
  ensureIndex(Wage,{estateId:1,sourceSystem:1,sourceKey:1},{unique:true});
  ensureIndex(Wage,{estateId:1,basis:1,period:1,mapBlockCode:1});
  const BlockManday=model('MappingBlockManday',{
    _id:String,estateId:{type:String,required:true,index:true},year:{type:Number,required:true},
    mapBlockCode:{type:String,required:true},division:{type:String,required:true},
    task:{type:String,required:true},activity:{type:String,required:true},
    mandayUnits:{type:Number,required:true,min:0},mapHa:{type:Number,required:true,min:0},
    divisionHa:{type:Number,required:true,min:0},sourceSystem:{type:String,required:true},
    sourceKey:{type:String,required:true},sourceFile:String,sourceHash:String,
    revision:{type:Number,default:0},updatedBy:String,history:[Schema.Types.Mixed],
  });
  ensureIndex(BlockManday,{estateId:1,year:1,mapBlockCode:1,task:1,activity:1},{unique:true});
  const WageArea=model('MappingWageArea',{
    _id:String,estateId:{type:String,required:true,index:true},year:{type:Number,required:true},
    sourceBlockId:String,sourceBlockCode:String,division:String,mapBlockCode:{type:String,default:null},
    mapHa:{type:Number,default:null},sourcePeriod:String,...provenance,sourceCell:String,
    note:String,revision:{type:Number,default:0},updatedBy:String,history:[Schema.Types.Mixed],
  });
  ensureIndex(WageArea,{estateId:1,year:1,mapBlockCode:1},{unique:true});
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
    ...activityFields, sourceSystem:String,sourceKey:String,sourceDetails:Schema.Types.Mixed,
    employeeNo: String,
    employeeName: String,
    activity: String,
    bunches: { type: Number, required: true, min: 0 },
  });
  const FieldActivity = model("MappingFieldActivity", {
    ...activityFields, sourceSystem:String,sourceKey:String,sourceDetails:Schema.Types.Mixed,
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
  ensureIndex(HarvestingActivity, {
    estateId: 1,
    employeeNo: 1,
    workDate: -1,
    _id: -1,
  });
  ensureIndex(HarvestingActivity, {
    estateId: 1,
    employeeName: 1,
    employeeNo: 1,
    workDate: -1,
    _id: -1,
  });
  const AnnualRainfall=model('MappingAnnualRainfall',{
    _id:String, estateId:{type:String,required:true,index:true},
    year:{type:Number,required:true,min:1900,max:2200},
    mm:{type:Number,required:true,min:0},
    fromMonth:{type:Number,required:true,min:1,max:12},
    toMonth:{type:Number,required:true,min:1,max:12},
    partial:{type:Boolean,required:true},period:String,
    rainDays:Number,monthlySumMm:Number,monthlySumRainDays:Number,
    monthly:[{_id:false,month:{type:Number,min:1,max:12},mm:{type:Number,min:0,default:null},rainDays:{type:Number,min:0,max:31,default:null},status:{type:String,enum:["recorded","NR","not_supplied"]}}],
    sourceId:{type:String,required:true},sourceName:String,sourceFile:String,
    active:{type:Boolean,default:true},
  });
  ensureIndex(AnnualRainfall,{estateId:1,year:1,sourceId:1},{unique:true});
  ensureIndex(AnnualRainfall,{estateId:1,year:1},{unique:true,partialFilterExpression:{active:true}});
  ensureIndex(MonthlyProduction,{estateId:1,month:-1,sourceBlockId:1,_id:1});
  ensureIndex(YearlyProduction,{estateId:1,year:1,sourceBlockId:1,_id:1});
  ensureIndex(ProductionName,{estateId:1,sourceBlockCode:1,_id:1});
  ensureIndex(ProductionComment,{estateId:1,year:1,sourceBlockId:1,_id:1});
  ensureIndex(Wage,{estateId:1,basis:1,period:1,_id:1});
  ensureIndex(WageArea,{estateId:1,year:1,sourceBlockCode:1,_id:1});
  const GeospatialReport=model('MappingGeospatialReport',{
    _id:String,estateId:{type:String,required:true},title:String,surveyDate:String,reportDate:String,
    sourceFile:String,sourceFiles:[String],mappingDate:String,importedAt:String,nextSurveyDue:String,cadenceMonths:Number,summary:Schema.Types.Mixed,issues:[String],findings:[Schema.Types.Mixed],
    files:[Schema.Types.Mixed],layers:[Schema.Types.Mixed],
  });
  const GeospatialRow=model('MappingGeospatialRow',{
    _id:String,estateId:{type:String,required:true},reportId:{type:String,required:true},sourceRow:Number,
    sourceBlockCode:String,mapBlockCode:String,mapMatch:String,plantingYear:String,cohort:String,
    surveyAreaHa:Number,currentAreaHa:Number,areaDifferenceHa:Number,oldAreaHa:Number,totalPalms:Number,
    palmsPerHectare:Number,densityCategory:String,growth:Schema.Types.Mixed,poorPercent:Number,
    highlight:Boolean,priority:Boolean,issues:[String],sourcePages:[Number],
  });
  ensureIndex(GeospatialReport,{estateId:1,surveyDate:-1,_id:1});
  ensureIndex(GeospatialRow,{estateId:1,reportId:1,sourceRow:1,_id:1});
  ensureIndex(GeospatialRow,{estateId:1,reportId:1,highlight:1,sourceRow:1,_id:1});
  const DocumentImport=model('MappingDocumentImport',{
    _id:String,estateId:{type:String,required:true},title:String,originalName:String,extension:String,filePath:String,
    sha256:String,bytes:Number,surveyDate:String,status:String,uploadedBy:String,uploadedAt:String,appliedBy:String,appliedAt:String,
    leaseUntil:Date,rowCount:Number,sheets:[String],warnings:[String],error:String,
  });
  const DocumentRow=model('MappingDocumentRow',{
    _id:String,estateId:{type:String,required:true},importId:{type:String,required:true},sequence:Number,
    sheet:String,sourceRow:Number,kind:String,cells:[String],highlight:Boolean,issues:[String],
  });
  ensureIndex(DocumentImport,{estateId:1,sha256:1},{unique:true});
  ensureIndex(DocumentImport,{estateId:1,_id:-1});
  ensureIndex(DocumentImport,{status:1,leaseUntil:1,createdAt:1});
  ensureIndex(DocumentRow,{estateId:1,importId:1,sequence:1},{unique:true});
  ensureIndex(DocumentRow,{estateId:1,importId:1,highlight:1,sequence:1});
  return {
    ...createOperationModels(model, Schema, ensureIndex), ...createTrialBalanceModels(model, Schema, ensureIndex), ...createVehicleModels(model, Schema, ensureIndex),
    DocumentImport, DocumentRow, GeospatialReport, GeospatialRow,
    Estate,
    Archive,
    Asset,
    Activity,
    Source,
    AccessGrant,
    Block,
    HarvestingActivity,
    FieldActivity,
    ProductionName,
    ProductionComment,
    MonthlyProduction,
    YearlyProduction,
    Wage,
    WageArea,
    BlockManday,
    AnnualRainfall,
  };
}
export const {StockIssue,LedgerEntry,CropReceipt,DocumentImport,DocumentRow,GeospatialReport,GeospatialRow,TrialBalanceSummary,TrialBalanceDetail,
  Vehicle,
  VehicleImport,
  VehicleTransaction,
  VehicleUsage,
  Estate,
  Archive,
  Asset,
  Activity,
  Source,
  AccessGrant,
  Block,
  HarvestingActivity,
  FieldActivity,
  ProductionName,
  ProductionComment,
  MonthlyProduction,
  YearlyProduction,
  Wage,
  WageArea,
  BlockManday,
  AnnualRainfall,
} = createModels();
