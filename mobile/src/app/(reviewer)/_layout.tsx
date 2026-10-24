import { RoleStack } from '@/ui/RoleStack';

export default function ReviewerLayout() {
  return (
    <RoleStack
      role="dermatologist"
      links={[
        { label: 'Queue', href: '/review', testID: 'nav-queue' },
        { label: 'Audit log', href: '/audit', testID: 'nav-audit' },
      ]}
    />
  );
}
