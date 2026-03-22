const { createClient } = require('redis');

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const QUEUE_KEY = 'rythmcast:playlist-jobs';

const redisClient = createClient({ url: REDIS_URL });
let redisReady = false;

redisClient.on('error', (error) => {
  console.error('Redis error:', error.message);
  redisReady = false;
});

redisClient.on('ready', () => {
  redisReady = true;
  console.log('Redis queue connected');
});

async function connectQueue() {
  if (!redisClient.isOpen) {
    await redisClient.connect();
  }
}

async function enqueueJob(payload) {
  await connectQueue();
  const item = {
    id: `job-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
    payload
  };
  await redisClient.rPush(QUEUE_KEY, JSON.stringify(item));
  return item;
}

async function dequeueJob() {
  await connectQueue();
  const value = await redisClient.lPop(QUEUE_KEY);
  return value ? JSON.parse(value) : null;
}

async function queueSize() {
  await connectQueue();
  const size = await redisClient.lLen(QUEUE_KEY);
  return Number(size);
}

function isQueueReady() {
  return redisReady;
}

module.exports = {
  enqueueJob,
  dequeueJob,
  queueSize,
  isQueueReady,
  connectQueue
};
