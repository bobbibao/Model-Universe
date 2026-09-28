import React from 'react';

export const inputClassName =
  'w-full rounded border-[1.5px] border-stroke bg-transparent px-4 py-3 text-black outline-none transition focus:border-brand-hover disabled:cursor-default disabled:bg-whiter dark:border-form-strokedark dark:bg-form-input dark:text-white dark:focus:border-brand-hover';

interface TextFieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
}

const TextField = ({ label, error, id, className = '', ...inputProps }: TextFieldProps) => {
  const inputId = id || inputProps.name;
  return (
    <div className={className}>
      <label htmlFor={inputId} className="mb-2 block text-sm font-medium text-black dark:text-white">
        {label}
      </label>
      <input id={inputId} className={`${inputClassName} ${error ? 'border-danger' : ''}`} {...inputProps} />
      {error && <p className="mt-1 text-sm text-danger">{error}</p>}
    </div>
  );
};

export default TextField;
