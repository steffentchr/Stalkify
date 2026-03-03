import { ConnectionOptions } from 'bullmq'

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379'

/**
 * Parse Redis URL into host and port
 */
function parseRedisUrl(url: string): { host: string; port: number } {
  const urlObj = new URL(url)
  return {
    host: urlObj.hostname,
    port: parseInt(urlObj.port) || 6379,
  }
}

const redisConfig = parseRedisUrl(REDIS_URL)

/**
 * BullMQ connection configuration
 * Shared across queues and workers
 */
export const queueConnection: ConnectionOptions = {
  host: redisConfig.host,
  port: redisConfig.port,
  maxRetriesPerRequest: null, // Required for BullMQ
  enableReadyCheck: false,
}
