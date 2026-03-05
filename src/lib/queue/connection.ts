import { ConnectionOptions } from 'bullmq'
import type { RedisOptions } from 'ioredis'

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379'

function parseRedisUrl(url: string): RedisOptions {
  const urlObj = new URL(url)
  return {
    host: urlObj.hostname,
    port: parseInt(urlObj.port) || 6379,
    ...(urlObj.password && { password: decodeURIComponent(urlObj.password) }),
    ...(urlObj.username && urlObj.username !== 'default' && { username: urlObj.username }),
  }
}

export const queueConnection: ConnectionOptions = {
  ...parseRedisUrl(REDIS_URL),
  maxRetriesPerRequest: null, // Required for BullMQ
  enableReadyCheck: false,
} as RedisOptions
