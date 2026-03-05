import { ConnectionOptions } from 'bullmq'

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379'

/**
 * Parse Redis URL into BullMQ connection options
 */
function parseRedisUrl(url: string): ConnectionOptions {
  const urlObj = new URL(url)
  return {
    host: urlObj.hostname,
    port: parseInt(urlObj.port) || 6379,
    ...(urlObj.password && { password: decodeURIComponent(urlObj.password) }),
    ...(urlObj.username && urlObj.username !== 'default' && { username: urlObj.username }),
  }
}

/**
 * BullMQ connection configuration
 * Shared across queues and workers
 */
export const queueConnection: ConnectionOptions = {
  ...parseRedisUrl(REDIS_URL),
  maxRetriesPerRequest: null, // Required for BullMQ
  enableReadyCheck: false,
}
