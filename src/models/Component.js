const mongoose = require("mongoose");

const componentSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      default: "",
      trim: true,
    },
    code: {
      type: String,
      default: "",
    },
    import: {
      type: String,
      default: "",
      trim: true,
    },
    usage: {
      type: String,
      default: "",
    },
    dependencies: {
      type: [String],
      default: [],
    },
    installCommand: {
      type: String,
      default: "",
      trim: true,
    },
    props: {
      type: [mongoose.Schema.Types.Mixed],
      default: [],
    },
    semanticTags: {
      type: [String],
      default: [],
      index: true,
    },
    searchText: {
      type: String,
      default: "",
      index: true,
    },
    uiPattern: {
      type: String,
      default: "",
      index: true,
    },
    framework: {
      type: String,
      default: "nextjs",
      index: true,
    },
    styling: {
      type: String,
      default: "tailwind",
      index: true,
    },
    qualityScore: {
      type: Number,
      default: 50,
      min: 0,
      max: 100,
    },
    popularity: {
      type: Number,
      default: 0,
      min: 0,
    },
    isValidComponent: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

module.exports = mongoose.model("Component", componentSchema, "ui_components");
