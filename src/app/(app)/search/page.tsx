import { getMasters } from '@/lib/masters';
import { SearchClient } from './SearchClient';

export const dynamic = 'force-dynamic';

export default async function SearchPage() {
  const masters = await getMasters();
  return <SearchClient masters={masters} />;
}
