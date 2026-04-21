import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Step {
  id: number;
  label: string;
  icon: string;
}

const steps: Step[] = [
  { id: 1, label: '대본 입력', icon: '📝' },
  { id: 2, label: 'SEO 분석', icon: '📊' },
  { id: 3, label: '효과 선택', icon: '🎬' },
  { id: 4, label: '장면 분석', icon: '🔍' },
  { id: 5, label: '이미지/영상', icon: '🖼️' },
];

interface ProgressStepperProps {
  currentStep: number;
  onStepClick: (step: number) => void;
}

export default function ProgressStepper({ currentStep, onStepClick }: ProgressStepperProps) {
  return (
    <div className="flex items-center justify-between w-full max-w-3xl mx-auto py-4 px-2">
      {steps.map((step, index) => (
        <div key={step.id} className="flex items-center flex-1 last:flex-none">
          <button
            onClick={() => onStepClick(step.id)}
            className={cn(
              'flex flex-col items-center gap-1.5 group relative',
              'transition-all duration-200'
            )}
          >
            <div
              className={cn(
                'w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold transition-all duration-300',
                currentStep > step.id
                  ? 'bg-primary text-primary-foreground shadow-[0_0_12px_oklch(0.585_0.233_277/0.4)]'
                  : currentStep === step.id
                  ? 'bg-primary/20 text-primary border-2 border-primary shadow-[0_0_16px_oklch(0.585_0.233_277/0.3)]'
                  : 'bg-secondary text-muted-foreground border border-border'
              )}
            >
              {currentStep > step.id ? (
                <Check className="w-4 h-4" />
              ) : (
                <span className="text-base">{step.icon}</span>
              )}
            </div>
            <span
              className={cn(
                'text-[11px] font-medium whitespace-nowrap transition-colors',
                currentStep >= step.id ? 'text-foreground' : 'text-muted-foreground'
              )}
            >
              {step.label}
            </span>
          </button>

          {index < steps.length - 1 && (
            <div className="flex-1 mx-2 mt-[-18px]">
              <div className="h-[2px] rounded-full bg-border relative overflow-hidden">
                <div
                  className="absolute inset-y-0 left-0 bg-primary rounded-full transition-all duration-500"
                  style={{ width: currentStep > step.id ? '100%' : '0%' }}
                />
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
