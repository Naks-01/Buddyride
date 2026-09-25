import dynamic from 'next/dynamic'

const BuddyRideApp = dynamic(() => import('../src/App'), { ssr: false })

export default function Home() {
  return <BuddyRideApp />
}