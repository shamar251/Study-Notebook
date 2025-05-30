import React, { useState, useEffect } from 'react';
import { DndContext, closestCenter } from '@dnd-kit/core';
import { arrayMove, SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Check, X } from 'lucide-react';

interface SequenceQuestionProps {
  question: any; // Should be SequenceQuizQuestion type
  blocks: any[]; // Should be Block[]
  onSubmit?: (userOrder: string[], isCorrect: boolean) => void;
  initialOrder?: string[];
  disabled?: boolean;
  advanceOnSubmit?: boolean;
  onOrderChange?: (order: string[]) => void;
  // Navigation props for test mode
  showNavigation?: boolean;
  onPrev?: () => void;
  onNext?: () => void;
  onFinalSubmit?: () => void;
  isFirst?: boolean;
  isLast?: boolean;
}

export function SequenceQuestion({
  question,
  blocks,
  onSubmit,
  initialOrder,
  disabled = false,
  advanceOnSubmit = false,
  onOrderChange,
  showNavigation = false,
  onPrev,
  onNext,
  onFinalSubmit,
  isFirst = false,
  isLast = false,
}: SequenceQuestionProps) {
  const [sequenceOrder, setSequenceOrder] = useState<string[]>(initialOrder || question.options);
  const [isAnswered, setIsAnswered] = useState(false);
  const [wasSequenceCorrect, setWasSequenceCorrect] = useState<boolean | null>(null);
  const [userSequenceOrder, setUserSequenceOrder] = useState<string[]>([]);
  const [showUserSequence, setShowUserSequence] = useState(false);

  useEffect(() => {
    setSequenceOrder(initialOrder || question.options);
    setIsAnswered(false);
    setWasSequenceCorrect(null);
    setUserSequenceOrder([]);
    setShowUserSequence(false);
  }, [question, initialOrder]);

  function handleDragEnd(event: any) {
    const { active, over } = event;
    if (!active || !over) return;
    if (active.id !== over.id) {
      const oldIndex = sequenceOrder.indexOf(active.id);
      const newIndex = sequenceOrder.indexOf(over.id);
      const newOrder = arrayMove(sequenceOrder, oldIndex, newIndex);
      setSequenceOrder(newOrder);
      if (advanceOnSubmit && onOrderChange) {
        onOrderChange(newOrder);
      }
    }
  }

  function handleSubmitOrder() {
    if (advanceOnSubmit) {
      if (onSubmit) onSubmit(sequenceOrder, false);
      return;
    }
    setUserSequenceOrder(sequenceOrder);
    setIsAnswered(true);
    const correct = JSON.stringify(sequenceOrder) === JSON.stringify(question.sequence);
    setWasSequenceCorrect(correct);
    if (onSubmit) onSubmit(sequenceOrder, correct);
    if (!correct) {
      setSequenceOrder(question.sequence);
      setShowUserSequence(false);
    }
  }

  function SortableItem({ id, disabled }: { id: string, disabled: boolean }) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
    const style = {
      transform: CSS.Transform.toString(transform),
      transition,
      opacity: isDragging ? 0.5 : 1,
      cursor: disabled ? 'default' : 'grab',
    };
    // Find the block for this id (for image support)
    const block = blocks && Array.isArray(blocks) ? blocks.find((b: any) => b && b.content === id) : null;
    return (
      <div
        ref={setNodeRef}
        style={style}
        {...attributes}
        {...listeners}
        className={`flex flex-col items-center rounded-lg border p-3 bg-white dark:bg-gray-800 mb-2 ${disabled ? 'opacity-60' : ''}`}
      >
        {block && block.image && (
          <img
            src={block.image}
            alt="Option"
            className="max-h-64 max-w-md rounded-md mb-2 object-contain"
            style={{ display: 'block', margin: '0 auto' }}
          />
        )}
        <span className="text-lg font-medium text-center">{id}</span>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6  ml-5 mb-6 max-w-[700px] w-full mx-auto flex flex-col" style={{ height: '500px' }}>
      <div className="flex justify-between items-start mb-4">
        <h2 className="text-xl font-bold">{question.question}</h2>
      </div>
      {/* Only use DnD when answering */}
      {!isAnswered ? (
        <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <div style={{ maxHeight: '100%', overflowY: 'auto', width: '100%', margin: '0 auto', padding: '0 20px' }} className="flex-1 min-h-0">
            <SortableContext items={sequenceOrder} strategy={verticalListSortingStrategy}>
              {sequenceOrder.map((id: string, idx: number) => (
                <div className="relative" key={id + '-' + idx}>
                  <SortableItem id={id} disabled={isAnswered || disabled} />
                </div>
              ))}
            </SortableContext>
          </div>
        </DndContext>
      ) : (
        <div style={{ maxHeight: '100%', overflowY: 'auto', width: '100%', margin: '0 auto', padding: '0 20px' }} className="flex-1 min-h-0">
          {(isAnswered && !wasSequenceCorrect) ? (
            (showUserSequence ? userSequenceOrder : question.sequence).map((id: string, idx: number) => (
              <div className="relative cursor-pointer select-none" key={id + '-' + idx} onClick={() => setShowUserSequence(s => !s)}>
                <div className="flex flex-col items-center rounded-lg border p-3 bg-white dark:bg-gray-800 mb-2 w-full">
                  <span className="text-lg font-medium text-center">{id}</span>
                </div>
                {showUserSequence
                  ? <span className="absolute right-2 top-1/2 -translate-y-1/2 text-red-600"><X className="w-5 h-5" /></span>
                  : <span className="absolute right-2 top-1/2 -translate-y-1/2 text-green-600"><Check className="w-5 h-5" /></span>
                }
              </div>
            ))
          ) : (
            question.sequence.map((id: string, idx: number) => (
              <div className="relative select-none" key={id + '-' + idx}>
                <div className="flex flex-col items-center rounded-lg border p-3 bg-white dark:bg-gray-800 mb-2 w-full">
                  <span className="text-lg font-medium text-center">{id}</span>
                </div>
                {isAnswered && wasSequenceCorrect && (
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-green-600">
                    <Check className="w-5 h-5" />
                  </span>
                )}
              </div>
            ))
          )}
        </div>
      )}
      {/* Only show buttons in quiz mode */}
      {!advanceOnSubmit && (
        <div className="flex justify-center gap-4 mt-6">
          {!isAnswered ? (
            <button
              className="bg-black text-white px-4 py-2 rounded"
              onClick={handleSubmitOrder}
              disabled={disabled}
            >
              Submit Order
            </button>
          ) : (
            <button
              className="bg-black text-white px-4 py-2 rounded"
              onClick={() => {
                setIsAnswered(false);
                setWasSequenceCorrect(null);
                setUserSequenceOrder([]);
                setShowUserSequence(false);
                setSequenceOrder(initialOrder || question.options);
              }}
            >
              Retry
            </button>
          )}
        </div>
      )}
      {/* Navigation for test mode */}
      {advanceOnSubmit && showNavigation && (
        <div className="flex justify-between items-center gap-2 mt-4">
          <button
            className="border rounded px-6 py-2 text-base font-semibold bg-white dark:bg-gray-900 hover:bg-gray-100 dark:hover:bg-gray-800 transition"
            onClick={onPrev}
            disabled={isFirst}
            type="button"
          >
            Previous
          </button>
          {isLast ? (
            <button
              className="ml-auto bg-black text-white px-6 py-2 rounded text-base font-semibold"
              onClick={onFinalSubmit}
              type="button"
            >
              Submit
            </button>
          ) : (
            <button
              className="ml-auto bg-black text-white px-6 py-2 rounded text-base font-semibold"
              onClick={onNext}
              type="button"
            >
              Next
            </button>
          )}
        </div>
      )}
      {/* Feedback at the bottom */}
      {isAnswered && !advanceOnSubmit && (
        <div className="mt-4 text-center">
          {wasSequenceCorrect
            ? <span className="text-green-600 font-bold">Correct!</span>
            : <span className="text-red-600 font-bold">Incorrect</span>
          }
        </div>
      )}
    </div>
  );
} 