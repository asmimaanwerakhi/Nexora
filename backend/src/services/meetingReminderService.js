const { Queue, Worker } = require('bullmq');
const IORedis = require('ioredis');
const Meeting = require('../models/meeting');
const MeetingJoinRequest = require('../models/meetingJoinRequest');
const livekitService = require('./livekitService');

const QUEUE_NAME = 'meeting-reminders';
const MAX_DELAY_MS = 2_147_000_000;
let queue;
let worker;
let connection;
let ioServer;

const getJobId = (meetingId, kind, target, chunk) =>
  `meeting:${meetingId}:${kind}:${target}:${chunk}`;

const addScheduledJob = async (meetingId, kind, target, chunk = null, extra = {}) => {
  if (!queue || target <= Date.now()) return;
  const remaining = target - Date.now();
  const jobChunk = chunk === null ? Math.ceil(remaining / MAX_DELAY_MS) : chunk;
  await queue.add(
    kind,
    { meetingId: meetingId.toString(), kind, target, chunk: jobChunk, ...extra },
    {
      jobId: getJobId(meetingId, kind, target, jobChunk),
      delay: Math.min(remaining, MAX_DELAY_MS),
      attempts: 5,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: true,
    },
  );
};

const getMeetingRecipientIds = async (meeting) => {
  const acceptedRequests = await MeetingJoinRequest.find({
    meetingId: meeting._id,
    status: 'accepted',
  }).select('userId');
  return [
    ...new Set([
      meeting.hostId.toString(),
      ...meeting.invitedUsers.map((userId) => userId.toString()),
      ...acceptedRequests.map((request) => request.userId.toString()),
    ]),
  ];
};

const notifyMeeting = async (meeting, event, payload, push) => {
  const recipientIds = await getMeetingRecipientIds(meeting);
  for (const recipientId of recipientIds) {
    ioServer?.to(`user:${recipientId}`).emit(event, payload);
  }
  if (push) {
    const { sendMeetingPush } = require('./pushService');
    await Promise.all(
      recipientIds.map((recipientId) =>
        sendMeetingPush({
          recipientId,
          title: push.title,
          body: push.body,
          meetingLink: meeting.meetingLink,
        }).catch((error) =>
          console.error(`Could not send meeting reminder to ${recipientId}`, error),
        ),
      ),
    );
  }
};

const processJob = async (job) => {
  const { meetingId, kind, target, chunk } = job.data;
  if (Date.now() < target) {
    await addScheduledJob(meetingId, kind, target, chunk - 1, {
      minutes: job.data.minutes,
      meetingStart: job.data.meetingStart,
    });
    return;
  }
  const meeting = await Meeting.findById(meetingId);
  if (!meeting || meeting.status === 'cancelled' || meeting.status === 'ended') return;

  const expectedStart = new Date(meeting.startTime).getTime();
  const expectedEnd = expectedStart + meeting.durationMinutes * 60_000;
  const payload = {
    meetingId,
    title: meeting.title,
    startTime: meeting.startTime,
    endTime: new Date(expectedEnd).toISOString(),
    meetingLink: meeting.meetingLink,
  };
  if (kind === 'reminder') {
    if (meeting.status !== 'scheduled' || expectedStart !== job.data.meetingStart) return;
    const minutes = job.data.minutes;
    await notifyMeeting(
      meeting,
      'meeting:reminder',
      { ...payload, minutesBefore: minutes },
      { title: `Meeting in ${minutes} minutes`, body: meeting.title },
    );
    return;
  }
  if (kind === 'duration-warning') {
    if (meeting.status !== 'live' || expectedEnd - 5 * 60_000 !== target) return;
    await notifyMeeting(meeting, 'meeting:duration-warning', payload, null);
    return;
  }
  if (kind === 'end') {
    if (expectedEnd !== target) return;
    const result = await Meeting.updateOne(
      { _id: meeting._id, status: { $in: ['scheduled', 'live'] } },
      { $set: { status: 'ended' } },
    );
    if (!result.matchedCount) return;
    await livekitService.endRoom(meeting._id);
    await notifyMeeting(meeting, 'meeting:ended', payload, null);
  }
};

const scheduleMeeting = async (meeting) => {
  if (!queue) return;
  const pendingJobs = await queue.getJobs(['delayed', 'waiting', 'paused']);
  await Promise.all(
    pendingJobs
      .filter((job) => job.data.meetingId === meeting._id.toString())
      .map((job) => job.remove()),
  );
  if (!['scheduled', 'live'].includes(meeting.status)) return;
  const start = new Date(meeting.startTime).getTime();
  const end = start + meeting.durationMinutes * 60_000;
  if (meeting.status === 'scheduled') {
    for (const minutes of [15, 5]) {
      const target = start - minutes * 60_000;
      if (target > Date.now()) {
        await addScheduledJob(meeting._id, 'reminder', target, null, {
          minutes,
          meetingStart: start,
        });
      }
    }
  }
  const warningAt = Math.max(start, end - 5 * 60_000);
  if (meeting.status === 'live' && warningAt > Date.now()) {
    await addScheduledJob(meeting._id, 'duration-warning', warningAt);
  }
  await addScheduledJob(meeting._id, 'end', end);
};

const startMeetingReminderWorker = async (io) => {
  ioServer = io;
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    console.warn(
      'REDIS_URL is unset; durable meeting reminders and automatic meeting end are disabled',
    );
    return { enabled: false, close: async () => {} };
  }

  connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
  queue = new Queue(QUEUE_NAME, { connection });
  worker = new Worker(QUEUE_NAME, processJob, {
    connection,
    concurrency: 10,
  });
  worker.on('failed', (job, error) => {
    console.error(`Meeting reminder job failed (${job?.id || 'unknown'})`, error);
  });
  try {
    await Promise.all([queue.waitUntilReady(), worker.waitUntilReady()]);
    const activeMeetings = await Meeting.find({ status: { $in: ['scheduled', 'live'] } });
    await Promise.all(activeMeetings.map((meeting) => scheduleMeeting(meeting)));
  } catch (error) {
    const cleanupResults = await Promise.allSettled([
      worker.close(),
      queue.close(),
      connection.quit(),
    ]);
    cleanupResults
      .filter((result) => result.status === 'rejected')
      .forEach((result) =>
        console.error('Could not clean up meeting reminder resources', result.reason),
      );
    worker = undefined;
    queue = undefined;
    connection = undefined;
    throw error;
  }
  return {
    enabled: true,
    close: async () => {
      await Promise.all([worker.close(), queue.close()]);
      await connection.quit();
      worker = undefined;
      queue = undefined;
      connection = undefined;
    },
  };
};

const cancelMeetingJobs = async (meetingId) => {
  if (!queue) return;
  const pendingJobs = await queue.getJobs(['delayed', 'waiting', 'paused']);
  await Promise.all(
    pendingJobs
      .filter((job) => job.data.meetingId === meetingId.toString())
      .map((job) => job.remove()),
  );
};

module.exports = {
  cancelMeetingJobs,
  scheduleMeeting,
  startMeetingReminderWorker,
};
