// Публичные страницы входа (план D6 п.2, реализованы досрочно: без них данные
// в приложении недоступны — замечание владельца). Лендинг и /privacy остаются
// в D6. Каркас без сайдбара — центрированная карточка.
import "@/components/ui/ui.css";
import "./auth.css";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="auth-wrap">
      <div className="auth-card">{children}</div>
    </div>
  );
}
