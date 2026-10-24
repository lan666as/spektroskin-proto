import { Redirect } from 'expo-router';

import { useSession } from '@/api/session';
import { Loading } from '@/ui/components';

export default function Index() {
  const { ready, user } = useSession();
  if (!ready) return <Loading />;
  if (!user) return <Redirect href="/login" />;
  return <Redirect href={user.role === 'dermatologist' ? '/review' : '/patients'} />;
}
