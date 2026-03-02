'use client'

import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Step {
  id: string
  title: string
  description?: string
}

interface StepperFormProps {
  steps: Step[]
  currentStep: number
  onStepClick?: (index: number) => void
}

export function StepperHeader({ steps, currentStep, onStepClick }: StepperFormProps) {
  return (
    <div className="flex items-center">
      {steps.map((step, index) => (
        <div key={step.id} className="flex items-center flex-1 last:flex-none">
          {/* 스텝 */}
          <button
            onClick={() => index < currentStep && onStepClick?.(index)}
            className={cn(
              'flex items-center gap-3 group',
              index < currentStep && 'cursor-pointer'
            )}
          >
            {/* 원형 인디케이터 */}
            <div className={cn(
              'w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold flex-shrink-0 transition-colors',
              index < currentStep
                ? 'bg-brand-600 text-white'
                : index === currentStep
                  ? 'bg-brand-100 text-brand-700 ring-2 ring-brand-600'
                  : 'bg-gray-100 text-gray-400'
            )}>
              {index < currentStep
                ? <Check size={16} />
                : <span>{index + 1}</span>
              }
            </div>

            {/* 텍스트 */}
            <div className="hidden sm:block text-left">
              <p className={cn(
                'text-sm font-medium',
                index === currentStep ? 'text-brand-700' : index < currentStep ? 'text-gray-700' : 'text-gray-400'
              )}>
                {step.title}
              </p>
              {step.description && (
                <p className="text-xs text-gray-400">{step.description}</p>
              )}
            </div>
          </button>

          {/* 연결선 */}
          {index < steps.length - 1 && (
            <div className={cn(
              'flex-1 h-0.5 mx-4',
              index < currentStep ? 'bg-brand-600' : 'bg-gray-200'
            )} />
          )}
        </div>
      ))}
    </div>
  )
}

interface StepperNavProps {
  currentStep: number
  totalSteps: number
  onPrev: () => void
  onNext: () => void
  onSubmit?: () => void
  isSubmitting?: boolean
  nextLabel?: string
  submitLabel?: string
  canNext?: boolean
}

export function StepperNav({
  currentStep,
  totalSteps,
  onPrev,
  onNext,
  onSubmit,
  isSubmitting,
  nextLabel = '다음',
  submitLabel = '완료',
  canNext = true,
}: StepperNavProps) {
  const isLast = currentStep === totalSteps - 1

  return (
    <div className="flex items-center justify-between mt-8 pt-6 border-t border-gray-200">
      <button
        onClick={onPrev}
        disabled={currentStep === 0}
        className="btn-secondary disabled:opacity-50 disabled:cursor-not-allowed"
      >
        이전
      </button>

      {isLast ? (
        <button
          onClick={onSubmit}
          disabled={isSubmitting || !canNext}
          className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSubmitting ? (
            <>
              <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              처리중...
            </>
          ) : submitLabel}
        </button>
      ) : (
        <button
          onClick={onNext}
          disabled={!canNext}
          className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {nextLabel}
        </button>
      )}
    </div>
  )
}
