const mongoose = require("mongoose");
const Component = require("../models/Component");

const getComponentById = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid component id" });
    }

    const component = await Component.findById(id)
      .select(
        "name description code import usage dependencies installCommand props semanticTags searchText uiPattern qualityScore popularity framework styling isValidComponent"
      )
      .lean();

    if (!component) {
      return res.status(404).json({ error: "Component not found" });
    }

    return res.json(component);
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  getComponentById,
};
