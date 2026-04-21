import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { useAppStore } from '@/lib/store';
import ProgressStepper from './ProgressStepper';
import Step1Script from './steps/Step1Script';
import Step2Seo from './steps/Step2Seo';
import Step3Effect from './steps/Step3Effect';
import Step4Analyze from './steps/Step4Analyze';
import Step5Generate from './steps/Step5Generate';
import { cn } from '@/lib/utils';
import { Check } from 'lucide-react';
import { useState, useEffect } from 'react';

interface TabWorkflowProps {
  tabId: string;
}

const stepConfig = [
  { id: 1, value: 'step1', label: 'STEP 1', title: '대본 입력 및 분리', icon: '📝' },
  { id: 2, value: 'step2', label: 'STEP 2', title: 'SEO 분석 및 최적화', icon: '📊' },
  { id: 3, value: 'step3', label: 'STEP 3', title: '이미지 효과 방식 선택', icon: '🎬' },
  { id: 4, value: 'step4', label: 'STEP 4', title: '장면 분석', icon: '🔍' },
  { id: 5, value: 'step5', label: 'STEP 5', title: '이미지 / 동영상 생성', icon: '🖼️' },
];

export default function TabWorkflow({ tabId }: TabWorkflowProps) {
  const { tabs, updateTab } = useAppStore();
  const tab = tabs.find((t) => t.id === tabId)!;
  const [openItems, setOpenItems] = useState<string[]>(['step1']);

  useEffect(() => {
    // Auto-open the current step
    const currentStepValue = `step${tab.currentStep}`;
    if (!openItems.includes(currentStepValue)) {
      setOpenItems((prev) => [...prev, currentStepValue]);
    }
  }, [tab.currentStep]);

  const handleStepClick = (step: number) => {
    const stepValue = `step${step}`;
    setOpenItems((prev) =>
      prev.includes(stepValue)
        ? prev.filter((v) => v !== stepValue)
        : [...prev, stepValue]
    );
  };

  return (
    <div className="space-y-4">
      {/* Progress Stepper */}
      <ProgressStepper currentStep={tab.currentStep} onStepClick={handleStepClick} />

      {/* Accordion Steps */}
      <Accordion
        type="multiple"
        value={openItems}
        onValueChange={setOpenItems}
        className="space-y-3"
      >
        {stepConfig.map((step) => {
          const isCompleted = tab.currentStep > step.id;
          const isCurrent = tab.currentStep === step.id;

          return (
            <AccordionItem
              key={step.value}
              value={step.value}
              className={cn(
                'rounded-lg border overflow-hidden transition-all duration-200',
                isCurrent
                  ? 'border-primary/50 shadow-[0_0_16px_oklch(0.585_0.233_277/0.1)]'
                  : isCompleted
                  ? 'border-emerald-500/30'
                  : 'border-border'
              )}
            >
              <AccordionTrigger
                className={cn(
                  'px-4 py-3 hover:no-underline transition-colors',
                  isCurrent ? 'bg-primary/5' : isCompleted ? 'bg-emerald-500/5' : 'bg-card'
                )}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={cn(
                      'w-8 h-8 rounded-lg flex items-center justify-center text-sm shrink-0',
                      isCompleted
                        ? 'bg-emerald-500/20 text-emerald-400'
                        : isCurrent
                        ? 'bg-primary/20 text-primary'
                        : 'bg-secondary text-muted-foreground'
                    )}
                  >
                    {isCompleted ? <Check className="w-4 h-4" /> : step.icon}
                  </div>
                  <div className="text-left">
                    <span
                      className={cn(
                        'text-[10px] font-bold uppercase tracking-wider',
                        isCurrent ? 'text-primary' : isCompleted ? 'text-emerald-400' : 'text-muted-foreground'
                      )}
                    >
                      {step.label}
                    </span>
                    <p className="text-sm font-medium">{step.title}</p>
                  </div>
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-4 pb-4 pt-2 bg-card">
                {step.id === 1 && <Step1Script tabId={tabId} />}
                {step.id === 2 && <Step2Seo tabId={tabId} />}
                {step.id === 3 && <Step3Effect tabId={tabId} />}
                {step.id === 4 && <Step4Analyze tabId={tabId} />}
                {step.id === 5 && <Step5Generate tabId={tabId} />}
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>
    </div>
  );
}
