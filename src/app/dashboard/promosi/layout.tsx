import { PageHeader } from "@/components/layout/page-header";

import { PromoTabs } from "./promo-tabs";

export default function PromosiLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <PageHeader title="Promosi" />
      <PromoTabs />
      {children}
    </>
  );
}
