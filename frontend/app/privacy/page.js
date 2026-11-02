import PrivacyNotice from '@/components/PrivacyNotice';
import { Card, PageTitle } from '@/components/ui';

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <PageTitle title="Privacy notice" subtitle="Nigeria Data Protection Act 2023 · notice version 2024-01-NDPA-v1" />
      <Card>
        <PrivacyNotice />
      </Card>
    </div>
  );
}
