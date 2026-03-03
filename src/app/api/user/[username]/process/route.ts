import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { fetchLastfmQueue } from '@/lib/queue/queues'
import { v4 as uuidv4 } from 'uuid'

export async function POST(
  request: NextRequest,
  { params }: { params: { username: string } }
) {
  try {
    const username = params.username

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
