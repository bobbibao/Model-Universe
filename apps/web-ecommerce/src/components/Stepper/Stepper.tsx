interface StepperProps {
  steps: string[];
  currentStep: number;
}

// Horizontal wizard progress indicator; `currentStep` is zero-based.
const Stepper = ({ steps, currentStep }: StepperProps) => {
  return (
    <ol className="flex w-full flex-wrap items-center gap-y-3">
      {steps.map((label, index) => {
        const isDone = index < currentStep;
        const isCurrent = index === currentStep;
        return (
          <li key={label} className={`flex items-center ${index < steps.length - 1 ? 'flex-1' : ''}`}>
            <span
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${
                isDone || isCurrent
                  ? 'bg-brand text-brand-ink'
                  : 'border border-stroke text-body dark:border-strokedark dark:text-bodydark'
              }`}
            >
              {isDone ? '✓' : index + 1}
            </span>
            <span
              className={`ml-2 whitespace-nowrap text-sm font-medium ${
                isCurrent ? 'text-black dark:text-white' : 'text-body dark:text-bodydark'
              }`}
            >
              {label}
            </span>
            {index < steps.length - 1 && (
              <span
                className={`mx-3 h-px min-w-6 flex-1 ${isDone ? 'bg-brand' : 'bg-stroke dark:bg-strokedark'}`}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
};

export default Stepper;
