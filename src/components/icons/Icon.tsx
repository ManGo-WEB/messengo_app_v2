// Иконки — обёртка над Lucide (пакет lucide-react, ISC-лицензия, атрибуция
// не требуется). Решение владельца: заменить самодельный набор иконок
// прототипа на Lucide (D1.5). API прежний (name/size/className/style) —
// все места использования работают без изменений.
// Соответствие имён проверено через Iconify API (полное покрытие 43/43).
import type { CSSProperties } from "react";
import {
  ArrowLeft,
  Bell,
  Brain,
  Briefcase,
  CalendarCheck,
  ChartLine,
  CheckCheck,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Clock,
  Download,
  Ellipsis,
  Eye,
  EyeOff,
  Filter,
  Folder,
  Globe,
  Headset,
  House,
  Info,
  Kanban,
  KeyRound,
  Lock,
  LogOut,
  Mail,
  MessageCircle,
  PanelLeftClose,
  Paperclip,
  Percent,
  Pencil,
  Phone,
  Plus,
  Search,
  Send,
  Settings,
  Sparkles,
  Table,
  Trash,
  User,
  Users,
  Wallet,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";

// Ключи — семантические имена, исторически используемые в коде приложения.
const ICONS = {
  arrowLeft: ArrowLeft,
  bell: Bell,
  bolt: Zap,
  brain: Brain,
  chart: ChartLine,
  chat: MessageCircle,
  checks: CheckCheck,
  chevronDown: ChevronDown,
  chevronLeft: ChevronLeft,
  chevronRight: ChevronRight,
  close: X,
  clock: Clock,
  collapse: PanelLeftClose,
  dots: Ellipsis,
  download: Download,
  envelope: Mail,
  eye: Eye,
  eyeOff: EyeOff,
  filter: Filter,
  folder: Folder,
  gear: Settings,
  globe: Globe,
  headset: Headset,
  help: CircleHelp,
  home: House,
  info: Info,
  kanban: Kanban,
  key: KeyRound,
  lock: Lock,
  logout: LogOut,
  paperclip: Paperclip,
  pencil: Pencil,
  percent: Percent,
  phone: Phone,
  plus: Plus,
  search: Search,
  send: Send,
  spark: Sparkles,
  table: Table,
  tasks: CalendarCheck,
  tools: Briefcase,
  trash: Trash,
  user: User,
  users: Users,
  wallet: Wallet,
} as const satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof ICONS;

export default function Icon({
  name,
  size = 20,
  className = "",
  style,
}: {
  name: IconName;
  size?: number;
  className?: string;
  style?: CSSProperties;
}) {
  // Неизвестное имя (не должно возникать при типизации) — заглушка dots.
  const Component = ICONS[name] ?? Ellipsis;
  return (
    <Component
      size={size}
      strokeWidth={1.8}
      className={`icon ${className}`}
      style={style}
      aria-hidden="true"
    />
  );
}
