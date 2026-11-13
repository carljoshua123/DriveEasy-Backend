const mongoose = require("mongoose");
const dns = require("dns");

const connectDB = async () => {
  const configuredDnsServers = process.env.MONGO_DNS_SERVERS
    ?.split(",")
    .map((server) => server.trim())
    .filter(Boolean);

  if (configuredDnsServers?.length) {
    dns.setServers(configuredDnsServers);
  }

  if (!process.env.MONGO_URI) {
    throw new Error("MONGO_URI is not configured.");
  }

  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  if (mongoose.connection.readyState === 2) {
    return mongoose.connection.asPromise();
  }

  await mongoose.connect(process.env.MONGO_URI);
  console.log("MongoDB connected.");
  return mongoose.connection;
};

module.exports = connectDB;
