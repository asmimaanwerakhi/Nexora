const mongoose = require('mongoose');

const connectDB = async () => {
  const { MONGODB_URI } = process.env;

  if (!MONGODB_URI) {
    throw new Error('MONGODB_URI is required to connect to MongoDB');
  }

  await mongoose.connect(MONGODB_URI, {
    autoIndex: process.env.NODE_ENV !== 'production',
  });

  return mongoose.connection;
};

const disconnectDB = async () => {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
};

module.exports = { connectDB, disconnectDB };
