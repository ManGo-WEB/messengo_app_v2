// Заглушка раздела «Оплаты» (план D1 КП; экран тарифов на моках — D4).
import { EmptyState } from "@/components/ui";

export default function PaymentsPage() {
  return (
    <>
      <h1 className="page-title">Оплаты</h1>
      <EmptyState
        icon="wallet"
        title="Тариф не выбран"
        text="Тарифная сетка каналов и расчёт стоимости появятся в фазе D4. Реальные платежи не подключены (PRD §10)."
      />
    </>
  );
}
