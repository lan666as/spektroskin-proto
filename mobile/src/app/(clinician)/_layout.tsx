import { RoleStack } from '@/ui/RoleStack';

export default function ClinicianLayout() {
  return (
    <RoleStack
      role="clinician"
      links={[
        { label: 'Home', href: '/patients', testID: 'nav-patients' },
        { label: 'My cases', href: '/cases', testID: 'nav-cases' },
      ]}
    />
  );
}
