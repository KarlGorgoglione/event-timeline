import type { ReactNode } from 'react';

export function Card({
  title,
  eyebrow,
  actions,
  children,
  className = '',
}: {
  title: ReactNode;
  eyebrow?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`card ${className}`}>
      <header className="card__head">
        <div>
          {eyebrow !== undefined && (
            <div className="card__eyebrow">{eyebrow}</div>
          )}
          <h2 className="card__title">{title}</h2>
        </div>
        {actions !== undefined && (
          <div className="card__actions">{actions}</div>
        )}
      </header>
      {children}
    </section>
  );
}
