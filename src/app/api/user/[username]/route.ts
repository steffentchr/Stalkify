import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(
  request: NextRequest,
  { params }: { params: { username: string } }
) {
  try {
    const user = await prisma.lastfmUser.findUnique({
      where: { username: params.username },
      include: {
        playlists: {
          where: { spotifyId: { not: '' } },
          orderBy: { feedType: 'asc' },
        },
        artists: {
          where: { period: 'overall' },
          orderBy: { rank: 'asc' },
          take: 48,
        },
      },
    })

    if (!user) {
      return NextResponse.json(
        { error: 'User not found', status: 'not_found' },
        { status: 404 }
      )
    }

    // Check if user is currently being processed
    const activeJob = await prisma.processingJob.findFirst({
      where: {
        username: params.username,
        status: { in: ['PENDING', 'PROCESSING'] },
      },
      orderBy: { createdAt: 'desc' },
    })

    if (activeJob) {
      return NextResponse.json({
        status: 'processing',
        jobId: activeJob.jobId,
      })
    }

    return NextResponse.json({
      status: 'exists',
      username: user.username,
      playlists: user.playlists.map((p) => ({
        feedType: p.feedType,
        name: p.name,
        spotifyUri: p.spotifyUri,
        trackCount: p.trackCount,
        lastUpdatedAt: p.lastUpdatedAt,
      })),
      artists: user.artists.map((a) => ({
        artistName: a.artistName,
        imageUrl: a.imageUrl,
        playCount: a.playCount,
        rank: a.rank,
      })),
    })
  } catch (error) {
    console.error('Error fetching user:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
