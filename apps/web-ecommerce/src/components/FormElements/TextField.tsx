import React, { useId } from 'react';
import DateTimeInput from '@/components/DateTimeInput';

export const inputClassName =
  'w-full rounded border-[1.5px] border-stroke bg-transparent px-4 py-3 text-black outline-none transition focus:border-brand-hover disabled:cursor-default disabled:bg-whiter dark:border-form-strokedark dark:bg-form-input dark:text-white dark:focus:border-brand-hover';

interface TextFieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
}

const TextField = ({ label, error, id, className = '', ...inputProps }: TextFieldProps) => {
  const generatedId = useId();
  const inputId = id || inputProps.name || generatedId;
  const Input = inputProps.type === 'date' || inputProps.type === 'datetime-local' ? DateTimeInput : 'input';
  const errorId = `${inputId}-error`;
  return (
    <div className={className}>
      <label htmlFor={inputId} className="mb-2 block text-sm font-medium text-black dark:text-white">
        {label}
      </label>
      <Input
        id={inputId}
        className={`${inputClassName} ${error ? 'border-danger' : ''}`}
        {...inputProps}
        aria-invalid={error ? true : inputProps['aria-invalid']}
        aria-describedby={
          [inputProps['aria-describedby'], error ? errorId : undefined].filter(Boolean).join(' ') || undefined
        }
      />
      {error && (
        <p id={errorId} className="mt-1 text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
};

export default TextField;
