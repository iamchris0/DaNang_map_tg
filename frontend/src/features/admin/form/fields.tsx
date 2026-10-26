import { type ComponentProps, type ReactNode, useId } from 'react';
import type { FieldError } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

const CONTROL =
  'block w-full rounded-xl border border-line bg-bg px-4 text-base outline-none transition-colors focus:border-fg focus:shadow-[inset_0_0_0_1px_var(--app-text)] aria-[invalid=true]:border-danger';

// Native select arrow replaced by a consistent chevron (same size/position on every OS).
const CHEVRON =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23717171' stroke-width='2.5'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")";

function useErrorText(error: FieldError | undefined): string | null {
  const { t } = useTranslation();
  if (!error?.message) return null;
  return t(error.message, { defaultValue: error.message });
}

interface FieldShellProps {
  label: string;
  error: FieldError | undefined;
  hint?: ReactNode;
  children: (ids: { id: string; describedBy: string | undefined }) => ReactNode;
}

function FieldShell({ label, error, hint, children }: FieldShellProps) {
  const id = useId();
  const message = useErrorText(error);
  const describedBy = message ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-sm leading-tight font-semibold">
        {label}
      </label>
      {children({ id, describedBy })}
      {message ? (
        <p id={`${id}-error`} className="text-danger text-sm">
          {message}
        </p>
      ) : (
        hint && (
          <p id={`${id}-hint`} className="text-hint text-sm">
            {hint}
          </p>
        )
      )}
    </div>
  );
}

type InputProps = ComponentProps<'input'> & {
  label: string;
  error: FieldError | undefined;
  hint?: ReactNode;
};

export function TextField({ label, error, hint, className = '', ...props }: InputProps) {
  return (
    <FieldShell label={label} error={error} hint={hint}>
      {({ id, describedBy }) => (
        <input
          id={id}
          aria-invalid={Boolean(error)}
          aria-describedby={describedBy}
          className={`${CONTROL} h-12 ${className}`}
          {...props}
        />
      )}
    </FieldShell>
  );
}

type TextAreaProps = ComponentProps<'textarea'> & {
  label: string;
  error: FieldError | undefined;
};

export function TextAreaField({ label, error, ...props }: TextAreaProps) {
  return (
    <FieldShell label={label} error={error}>
      {({ id, describedBy }) => (
        <textarea
          id={id}
          rows={4}
          aria-invalid={Boolean(error)}
          aria-describedby={describedBy}
          className={`${CONTROL} py-3`}
          {...props}
        />
      )}
    </FieldShell>
  );
}

type SelectProps = ComponentProps<'select'> & {
  label: string;
  error: FieldError | undefined;
  options: { value: string; label: string }[];
};

export function SelectField({ label, error, options, ...props }: SelectProps) {
  return (
    <FieldShell label={label} error={error}>
      {({ id, describedBy }) => (
        <select
          id={id}
          aria-invalid={Boolean(error)}
          aria-describedby={describedBy}
          className={`${CONTROL} h-12 appearance-none bg-[length:16px] bg-[right_1rem_center] bg-no-repeat pr-10`}
          style={{ backgroundImage: CHEVRON }}
          {...props}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      )}
    </FieldShell>
  );
}

export function FormSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-line bg-bg space-y-4 rounded-2xl border p-4 lg:p-6">
      <h2 className="text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}
