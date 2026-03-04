import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { fetchLastfmQueue } from '@/lib/queue/queues'
import { cachedLastfmClient } from '@/lib/lastfm/cache'
import { v4 as uuidv4 } from 'uuid'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ username: string }> }
) {
  try {
    const { username } = await params

    // Validate username format
    if (!/^[a-zA-Z0-9_-]{2,15}$/.test(username)) {
      return NextResponse.json(
        { error: 'Invalid Last.fm username' },
        { status: 400 }
      )
    }

    // Verify user exists on Last.fm
    const exists = await cachedLastfmClient.userExists(username)
    if (!exists) {
      return NextResponse.json(
        { error: `Last.fm user "${username}" not found` },
        { status: 404 }
      )
    }

    // Check if user already has an active processing job
    const existingJob = await prisma.processingJob.findFirst({
      where: {
        username,
        status: { in: ['PENDING', 'PROCESSING'] },
      },
      orderBy: { createdAt: 'desc' },
    })

    if (existingJob) {
      return NextResponse.json({
        jobId: existingJob.jobId,
        status: 'already_processing',
      })
    }

    // Create a new processing job
    const jobId = uuidv4()
    const job = await prisma.processingJob.create({
      data: {
        jobId,
        username,
        jobType: 'initial_process',
        status: 'PENDING',
        progress: 0,
      },
    })

    // Queue the fetch-lastfm job
    await fetchLastfmQueue.add(
      'fetch',
      {
        username,
        processingJobId: job.jobId,
        isInitialProcess: true,
      },
      {
        jobId,
        removeOnComplete: 100,
        removeOnFail: 500,
      }
    )

    return NextResponse.json({
      jobId: job.jobId,
      status: 'queued',
    })
  } catch (error) {
    console.error('Error starting processing:', error)
    return NextResponse.json(
      { error: 'Failed to start processing' },
      { status: 500 }
    )
  }
}
