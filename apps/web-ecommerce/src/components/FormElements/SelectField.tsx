import React from 'react';
import { inputClassName } from './TextField';

interface SelectFieldProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  options: { value: string; label: string }[];
  placeholder?: string;
  error?: string;
}

const SelectField = ({ label, options, placeholder, error, id, className = '', ...selectProps }: SelectFieldProps) => {
  const selectId = id || selectProps.name;
  return (
    <div className={className}>
      <label htmlFor={selectId} className="mb-2 block text-sm font-medium text-black dark:text-white">
        {label}
      </label>
      <select id={selectId} className={`${inputClassName} ${error ? 'border-danger' : ''}`} {...selectProps}>
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {error && <p className="mt-1 text-sm text-danger">{error}</p>}
    </div>
  );
};

export default SelectField;
