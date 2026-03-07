import type { Metadata } from 'next'

export async function generateMetadata(
  { params }: { params: Promise<{ username: string }> }
): Promise<Metadata> {
  const { username } = await params
  return {
    title: `@${username}`,
  }
}

export default function UserLayout({ children }: { children: React.ReactNode }) {
  return children
}
