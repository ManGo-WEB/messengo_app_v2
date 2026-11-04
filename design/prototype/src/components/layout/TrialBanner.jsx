import Icon from '../icons/Icon.jsx'
import { Button } from '../ui/ui.jsx'
import './trial.css'

export default function TrialBanner({ onPay }) {
  return (
    <div className="trial">
      <span className="trial__ic">
        <Icon name="info" size={20} />
      </span>
      <div className="trial__body">
        <div className="trial__title">Пробный период закончился</div>
        <div className="trial__text">
          Оплатите тариф, чтобы снова пользоваться всеми возможностями кабинета
        </div>
      </div>
      <Button size="sm" onClick={onPay}>
        Оплатить тариф
      </Button>
    </div>
  )
}
