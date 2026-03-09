'use server'

import { revalidatePath } from 'next/cache'
import { v4 as uuidv4 } from 'uuid'
import { prisma } from '@/lib/prisma'
import { getFetchLastfmQueue } from '@/lib/queue/queues'

export async function triggerUpdate(username: string) {
  // Expire stuck jobs older than 30 minutes
  const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000)
  await prisma.processingJob.updateMany({
    where: { username, status: { in: ['PENDING', 'PROCESSING'] }, createdAt: { lt: thirtyMinutesAgo } },
    data: { status: 'FAILED', errorMessage: 'Timed out', completedAt: new Date() },
  })

  const existing = await prisma.processingJob.findFirst({
    where: { username, status: { in: ['PENDING', 'PROCESSING'] } },
  })
  if (existing) {
    revalidatePath('/admin')
    return
  }

  const jobId = uuidv4()
  await prisma.processingJob.create({
    data: { jobId, username, jobType: 'update', status: 'PENDING', progress: 0 },
  })
  await getFetchLastfmQueue().add(
    'fetch',
    { username, processingJobId: jobId, isInitialProcess: false },
    { jobId, priority: 1, removeOnComplete: 100, removeOnFail: 500 }
  )

  revalidatePath('/admin')
}

export async function fullRebuild(username: string) {
  const user = await prisma.lastfmUser.findUnique({ where: { username } })

  if (user) {
    // Delete all playlists (cascades to playlist_tracks)
    await prisma.playlist.deleteMany({ where: { userId: user.id } })
    // Delete top artist data
    await prisma.userArtist.deleteMany({ where: { userId: user.id } })
  }

  // Cancel any pending/processing jobs
  await prisma.processingJob.updateMany({
    where: { username, status: { in: ['PENDING', 'PROCESSING'] } },
    data: { status: 'CANCELLED', completedAt: new Date() },
  })

  const jobId = uuidv4()
  await prisma.processingJob.create({
    data: { jobId, username, jobType: 'rebuild', status: 'PENDING', progress: 0 },
  })
  await getFetchLastfmQueue().add(
    'fetch',
    { username, processingJobId: jobId, isInitialProcess: true },
    { jobId, priority: 1, removeOnComplete: 100, removeOnFail: 500 }
  )

  revalidatePath('/admin')
}
