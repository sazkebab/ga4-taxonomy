import { redirect } from 'next/navigation'

export default async function ClientPage({
  params,
}: {
  params: Promise<{ clientSlug: string }>
}) {
  const { clientSlug } = await params
  redirect(`/clients/${clientSlug}/projects`)
}
