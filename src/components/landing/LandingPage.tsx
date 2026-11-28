// Продуктовый лендинг «/» (план D6 п.1). Порядок блоков и тексты —
// landing/structure.md (content.ts). Путь клиента: лендинг → регистрация →
// приложение, поэтому целевое действие одно: «Начать 7 дней бесплатно» ведёт
// на /register, «Войти» — на /login. Серверный компонент без стейта —
// страница статическая.
import Link from "next/link";
import Image from "next/image";
import type { ReactNode } from "react";
import Icon from "../icons/Icon";
import ChannelIcon from "../icons/ChannelIcon";
import HeroMock from "./HeroMock";
import {
  AUDIENCE,
  AUDIENCE_NOTE,
  CHANNELS,
  CTA_LOGIN,
  CTA_REGISTER,
  FAQ,
  FEATURES,
  FINAL,
  FOOTER_CONTACTS_PLACEHOLDER,
  FOOTER_COPYRIGHT,
  FOOTER_DISCLAIMER,
  FOOTER_TAGLINE,
  NAV,
  PAINS,
  PAINS_BRIDGE,
  PRIVACY_POINTS,
  STEPS,
  TRIAL_PLACEHOLDER,
  TRIAL_POINTS,
} from "./content";
import "./landing.css";

// Кнопки-призывы — ссылки на страницы входа, поэтому классы .btn дизайн-системы
// (ui.css): сам Button рендерит <button>, а не <a>.
function LinkButton({
  href,
  variant = "primary",
  size = "lg",
  children,
}: {
  href: string;
  variant?: "primary" | "outline" | "ghost";
  size?: "md" | "lg";
  children: ReactNode;
}) {
  return (
    <Link href={href} className={`btn btn--${variant} btn--${size} ld-btn`}>
      {children}
    </Link>
  );
}

// Заглушки текстов (структура → «Что помечено и почему»): видны только на
// dev-стенде — владелец видит, где ждём его решений; в прод-сборке ветка
// вырезается и посетитель заглушку не встретит.
function Placeholder({ text, inline = false }: { text: string; inline?: boolean }) {
  if (process.env.NODE_ENV !== "development") return null;
  return <p className={`ld-placeholder ${inline ? "ld-placeholder--inline" : ""}`}>{text}</p>;
}

export default function LandingPage() {
  return (
    <div className="landing">
      {/* 0. Шапка */}
      <header className="ld-header">
        <div className="ld-wrap ld-header__inner">
          <Link href="/" className="ld-brand">
            <Image src="/logo.png" alt="" width={28} height={28} />
            Messengo
          </Link>
          <nav className="ld-nav" aria-label="Разделы страницы">
            {NAV.map((item) => (
              <a key={item.href} href={item.href}>
                {item.label}
              </a>
            ))}
          </nav>
          <div className="ld-header__actions">
            <LinkButton href="/login" variant="ghost" size="md">
              {CTA_LOGIN}
            </LinkButton>
            <LinkButton href="/register" size="md">
              {CTA_REGISTER}
            </LinkButton>
          </div>
        </div>
      </header>

      <main>
        {/* 1. Первый экран */}
        <section className="ld-hero" aria-labelledby="hero-title">
          <div className="ld-wrap ld-hero__grid">
            <div>
              <span className="ld-eyebrow">Одно окно для всех мессенджеров</span>
              <h1 className="ld-hero__title" id="hero-title">
                Клиенты пишут в Telegram, MAX и Instagram* — а вы разрываетесь между пятью приложениями?
              </h1>
              <p className="ld-hero__text">
                Messengo собирает переписку с клиентами в одно окно и помогает отвечать быстрее. Подключите
                свои мессенджеры — и всем клиентам можно отвечать из одного списка.
              </p>
              <div className="ld-actions">
                <LinkButton href="/register">{CTA_REGISTER}</LinkButton>
                <LinkButton href="/login" variant="outline">
                  {CTA_LOGIN}
                </LinkButton>
              </div>
              <p className="ld-note">Без карты и установки · регистрация за минуту</p>
            </div>
            <HeroMock />
          </div>
        </section>

        {/* 2. «Знакомо?» */}
        <section className="ld-sec" aria-labelledby="pains-title">
          <div className="ld-wrap">
            <div className="ld-sec__head ld-sec__head--center">
              <h2 className="ld-sec__title" id="pains-title">
                Знакомо?
              </h2>
            </div>
            <div className="ld-grid-3">
              {PAINS.map((pain, index) => (
                <article key={pain.title} className="ld-card">
                  <span className="ld-pain__num">{index + 1}</span>
                  <h3 className="ld-card__title">{pain.title}</h3>
                  <p className="ld-card__text">{pain.text}</p>
                </article>
              ))}
            </div>
            <p className="ld-pains__bridge">{PAINS_BRIDGE}</p>
          </div>
        </section>

        {/* 3. «Кому подойдёт» */}
        <section className="ld-sec" aria-labelledby="audience-title">
          <div className="ld-wrap">
            <div className="ld-sec__head ld-sec__head--center">
              <h2 className="ld-sec__title" id="audience-title">
                Кому подойдёт
              </h2>
              <p className="ld-sec__lead">
                Messengo создан для того, кто сам ведёт переписку с клиентами. Это про вас, если:
              </p>
            </div>
            <div className="ld-audience__panel">
              <ul className="ld-checklist">
                {AUDIENCE.map((item) => (
                  <li key={item}>
                    <Icon name="check" size={18} />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
              <p className="ld-audience__note">
                <Icon name="info" size={16} />
                <span>{AUDIENCE_NOTE}</span>
              </p>
            </div>
          </div>
        </section>

        {/* 4. Возможности */}
        <section className="ld-sec ld-sec--tint" id="features" aria-labelledby="features-title">
          <div className="ld-wrap">
            <div className="ld-sec__head">
              <h2 className="ld-sec__title" id="features-title">
                Messengo — одно окно для всех мессенджеров
              </h2>
              <p className="ld-sec__lead">
                Подключите мессенджеры один раз — дальше вся клиентская переписка идёт через одно окно.
              </p>
            </div>
            <div className="ld-grid-3">
              {FEATURES.map((feature) => (
                <article key={feature.title} className="ld-card">
                  <span className="ld-card__ic">
                    <Icon name={feature.icon} size={24} />
                  </span>
                  <h3 className="ld-card__title">{feature.title}</h3>
                  {feature.channels && (
                    <div className="ld-feature__channels" aria-hidden="true">
                      {CHANNELS.map((channel) => (
                        <ChannelIcon key={channel.id} id={channel.id} size={26} />
                      ))}
                    </div>
                  )}
                  <p className="ld-card__text">{feature.text}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* 5. «Как это работает» */}
        <section className="ld-sec ld-sec--tint" id="how" aria-labelledby="how-title">
          <div className="ld-wrap">
            <div className="ld-sec__head ld-sec__head--center">
              <h2 className="ld-sec__title" id="how-title">
                Как это работает
              </h2>
            </div>
            <ol className="ld-steps">
              {STEPS.map((step, index) => (
                <li key={step.title} className="ld-step">
                  <span className="ld-step__num">{index + 1}</span>
                  <h3 className="ld-step__title">{step.title}</h3>
                  <p className="ld-step__text">{step.text}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>
        {/* 6. «Попробуйте Messengo бесплатно» */}
        <section className="ld-sec" aria-labelledby="trial-title">
          <div className="ld-wrap">
            <div className="ld-trial__card">
              <div>
                <h2 className="ld-sec__title" id="trial-title">
                  Попробуйте Messengo бесплатно
                </h2>
                <p className="ld-sec__lead">
                  7 дней полного доступа, чтобы посмотреть сервис в настоящей работе — со своими клиентами и
                  своей перепиской.
                </p>
                <LinkButton href="/register">{CTA_REGISTER}</LinkButton>
                <Placeholder text={TRIAL_PLACEHOLDER} />
              </div>
              <ul className="ld-checklist">
                {TRIAL_POINTS.map((point) => (
                  <li key={point.title}>
                    <Icon name="check" size={18} />
                    <span>
                      <strong>{point.title}</strong> {point.text}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* 7. «Ваша переписка остаётся вашей» */}
        <section className="ld-sec ld-sec--tint" aria-labelledby="privacy-title">
          <div className="ld-wrap">
            <div className="ld-sec__head">
              <h2 className="ld-sec__title" id="privacy-title">
                Ваша переписка остаётся вашей
              </h2>
              <p className="ld-sec__lead">
                Подключая мессенджеры, вы доверяете сервису общение с клиентами. Поэтому доступом управляете вы.
              </p>
            </div>
            <div className="ld-grid-3">
              {PRIVACY_POINTS.map((point) => (
                <article key={point.title} className="ld-card">
                  <span className="ld-card__ic">
                    <Icon name={point.icon} size={24} />
                  </span>
                  <h3 className="ld-card__title">{point.title}</h3>
                  <p className="ld-card__text">{point.text}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* 8. «Вопросы и ответы»: нативные <details> — без клиентского JS */}
        <section className="ld-sec" id="faq" aria-labelledby="faq-title">
          <div className="ld-wrap">
            <div className="ld-sec__head ld-sec__head--center">
              <h2 className="ld-sec__title" id="faq-title">
                Вопросы и ответы
              </h2>
            </div>
            <div className="ld-faq">
              {FAQ.map((item) => (
                <details key={item.question} className="ld-faq__item">
                  <summary className="ld-faq__q">
                    {item.question}
                    <Icon name="chevronDown" size={18} className="ld-faq__chev" />
                  </summary>
                  <div className="ld-faq__a">
                    <p>{item.answer}</p>
                    {item.placeholder && <Placeholder text={item.placeholder} inline />}
                  </div>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* 9. Финальный призыв */}
        <section className="ld-sec" aria-labelledby="final-title">
          <div className="ld-wrap">
            <div className="ld-final__card">
              <h2 className="ld-sec__title" id="final-title">
                {FINAL.title}
              </h2>
              <p className="ld-final__text">{FINAL.text}</p>
              <div className="ld-actions">
                <LinkButton href="/register">{CTA_REGISTER}</LinkButton>
                <LinkButton href="/login" variant="outline">
                  {CTA_LOGIN}
                </LinkButton>
              </div>
              <p className="ld-note">{FINAL.note}</p>
            </div>
          </div>
        </section>
      </main>

      {/* 10. Подвал */}
      <footer className="ld-footer">
        <div className="ld-wrap">
          <div className="ld-footer__top">
            <span className="ld-footer__brand">
              <Image src="/logo.png" alt="" width={24} height={24} />
              {FOOTER_TAGLINE}
            </span>
            <nav className="ld-footer__nav" aria-label="Полезные ссылки">
              {NAV.map((item) => (
                <a key={item.href} href={item.href}>
                  {item.label}
                </a>
              ))}
              <Link href="/login">{CTA_LOGIN}</Link>
              <Link href="/privacy">Политика конфиденциальности</Link>
            </nav>
          </div>
          <div className="ld-footer__bottom">
            <span>{FOOTER_COPYRIGHT}</span>
            {/* Контакты даст владелец (структура → «Что помечено и почему») */}
            {FOOTER_CONTACTS_PLACEHOLDER.map((contact) => (
              <Placeholder key={contact} text={contact} inline />
            ))}
          </div>
          {/* Дисклеймер — самая нижняя строка страницы, мелким шрифтом */}
          <p className="ld-footer__disclaimer">{FOOTER_DISCLAIMER}</p>
        </div>
      </footer>
    </div>
  );
}
