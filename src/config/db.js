const mongoose = require("mongoose");
const config = require("./index");

const connectToDatabase = async () => {
  await mongoose.connect(config.mongodbUri, {
    dbName: config.mongodbDbName,
    maxPoolSize: 20,
    serverSelectionTimeoutMS: 5000,
  });
};

module.exports = {
  connectToDatabase,
};
