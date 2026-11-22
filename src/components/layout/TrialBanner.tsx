// Баннер «Пробный период закончился» — порт из прототипа
// (design/prototype/src/components/layout/TrialBanner.jsx).
"use client";

import Icon from "../icons/Icon";
import { Button } from "../ui";
import "./trial.css";

export default function TrialBanner({ onPay }: { onPay?: () => void }) {
  return (
    <div className="trial">
      <span className="trial__ic">
        <Icon name="info" size={20} />
      </span>
      <div className="trial__body">
        <div className="trial__title">Пробный период закончился</div>
        <div className="trial__text">Оплатите тариф, чтобы снова пользоваться всеми возможностями кабинета</div>
      </div>
      <Button size="sm" onClick={onPay}>
        Оплатить тариф
      </Button>
    </div>
  );
}
