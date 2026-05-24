import { redirect } from 'next/navigation';
import { getOrgContextOrNull } from '@/src/lib/tenant';

export default async function Home() {
  const ctx = await getOrgContextOrNull();
  if (ctx) {
    redirect('/dashboard');
  }
  redirect('/login');
}
