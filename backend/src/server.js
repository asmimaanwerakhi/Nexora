require('dotenv').config();

const http = require('node:http');
const app = require('./app');
const { connectDB, disconnectDB } = require('./config/db');
const createSocketServer = require('./sockets');
const { resetPresence } = require('./services/presenceService');
const { startMeetingReminderWorker } = require('./services/meetingReminderService');

const startServer = async () => {
  await connectDB();
  try {
    await resetPresence();
  } catch (error) {
    await disconnectDB();
    throw error;
  }

  const application = app();
  const httpServer = http.createServer(application);
  const io = createSocketServer(httpServer);
  application.set('io', io);
  let meetingJobs;
  try {
    meetingJobs = await startMeetingReminderWorker(io);
  } catch (error) {
    await new Promise((resolve) => io.close(resolve));
    await disconnectDB();
    throw error;
  }
  const port = Number(process.env.PORT || 5000);

  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    await meetingJobs.close();
    await new Promise((resolve) => io.close(resolve));
    await disconnectDB();
    throw new Error('PORT must be an integer between 0 and 65535');
  }

  try {
    await new Promise((resolve, reject) => {
      httpServer.once('error', reject);
      httpServer.listen(port, resolve);
    });
  } catch (error) {
    await meetingJobs.close();
    await new Promise((resolve) => io.close(resolve));
    await disconnectDB();
    throw error;
  }

  console.info(`Nexora API listening on port ${port}`);

  let shutdownPromise;
  const shutdown = () => {
    if (!shutdownPromise) {
      shutdownPromise = Promise.all([
        new Promise((resolve) => io.close(resolve)),
        meetingJobs.close(),
      ]).then(disconnectDB);
    }

    return shutdownPromise;
  };

  const handleSignal = (signal) => {
    console.info(`Received ${signal}; shutting down`);
    shutdown().catch((error) => {
      console.error('Graceful shutdown failed', error);
      process.exitCode = 1;
    });
  };

  process.once('SIGINT', handleSignal);
  process.once('SIGTERM', handleSignal);

  return { httpServer, io, shutdown };
};

if (require.main === module) {
  startServer().catch((error) => {
    console.error('Server failed to start', error);
    process.exitCode = 1;
  });
}

module.exports = { startServer };
