import { RoleStack } from '@/ui/RoleStack';

export default function ClinicianLayout() {
  return (
    <RoleStack
      role="clinician"
      links={[
        { label: 'Patients', href: '/patients', testID: 'nav-patients' },
        { label: 'My cases', href: '/cases', testID: 'nav-cases' },
      ]}
    />
  );
}
