import { type ComponentProps, type ReactNode, useId } from 'react';
import type { FieldError } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

const CONTROL =
  'w-full rounded-xl border bg-bg px-3 text-base outline-none focus:border-accent aria-[invalid=true]:border-danger';

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
      <label htmlFor={id} className="block text-sm font-medium">
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
          className={`${CONTROL} border-hint/30 min-h-11 ${className}`}
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
          className={`${CONTROL} border-hint/30 py-2`}
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
          className={`${CONTROL} border-hint/30 min-h-11`}
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
    <section className="bg-surface space-y-3 rounded-2xl p-4">
      <h2 className="text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}
