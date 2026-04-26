const app = require("./app");
const config = require("./config");
const { connectToDatabase } = require("./config/db");

const start = async () => {
  try {
    await connectToDatabase();
    app.listen(config.port, () => {
      console.log(`Solbit backend listening on port ${config.port}`);
    });
  } catch (error) {
    console.error("Failed to start server:", error.message);
    process.exit(1);
  }
};

start();
