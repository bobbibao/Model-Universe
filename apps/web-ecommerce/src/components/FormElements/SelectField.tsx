import React, { useId } from 'react';
import { inputClassName } from './TextField';

interface SelectFieldProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  options: { value: string; label: string }[];
  placeholder?: string;
  error?: string;
}

const SelectField = ({ label, options, placeholder, error, id, className = '', ...selectProps }: SelectFieldProps) => {
  const generatedId = useId();
  const selectId = id || selectProps.name || generatedId;
  const errorId = `${selectId}-error`;
  return (
    <div className={className}>
      <label htmlFor={selectId} className="mb-2 block text-sm font-medium text-black dark:text-white">
        {label}
      </label>
      <select
        id={selectId}
        className={`${inputClassName} ${error ? 'border-danger' : ''}`}
        {...selectProps}
        aria-invalid={error ? true : selectProps['aria-invalid']}
        aria-describedby={
          [selectProps['aria-describedby'], error ? errorId : undefined].filter(Boolean).join(' ') || undefined
        }
      >
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {error && (
        <p id={errorId} className="mt-1 text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
};

export default SelectField;
