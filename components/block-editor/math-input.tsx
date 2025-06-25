"use client"

import React, { useState, useRef, useEffect } from "react"
import { Textarea } from "@/components/ui/textarea"
import { InlineMath } from 'react-katex'

interface MathInputProps {
  value: string
  onChange: (value: string) => void
  placeholder: string
  isMathMode?: boolean
  onPaste?: (e: React.ClipboardEvent<HTMLTextAreaElement>) => void
  readOnly?: boolean
}

export function MathInput({
  value,
  onChange,
  placeholder,
  isMathMode,
  onPaste,
  readOnly
}: MathInputProps) {
  const [isMathModeInternal, setIsMathModeInternal] = useState(isMathMode || false)
  const [mathError, setMathError] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const cursorPositionRef = useRef<number | null>(null)

  useEffect(() => {
    setIsMathModeInternal(!!isMathMode)
  }, [isMathMode])

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value
    cursorPositionRef.current = e.target.selectionStart

    onChange(newValue)

    // Restore cursor position after state update
    if (cursorPositionRef.current !== null) {
      requestAnimationFrame(() => {
        if (textareaRef.current) {
          textareaRef.current.focus()
          textareaRef.current.setSelectionRange(cursorPositionRef.current, cursorPositionRef.current)
        }
      })
    }

    if (isMathModeInternal) {
      try {
        if (newValue) {
          setMathError(null)
        }
      } catch (error) {
        setMathError("Invalid math expression")
      }
    }
  }

  // Handle focus to store cursor position
  const handleFocus = (e: React.FocusEvent<HTMLTextAreaElement>) => {
    cursorPositionRef.current = e.target.selectionStart
  }

  return (
    <div className="space-y-2">
      {isMathModeInternal ? (
        <div className="space-y-2">
          <Textarea
            ref={textareaRef}
            value={value}
            onChange={handleChange}
            onFocus={handleFocus}
            onPaste={onPaste}
            placeholder={placeholder}
            className={`min-h-[60px] resize-y font-mono ${readOnly ? 'focus-visible:ring-0 focus-visible:border-none border-gray-300' : ''}`}
            readOnly={readOnly}
          />
          {value && (
            <div className="p-2 bg-gray-50 dark:bg-gray-800 rounded-md">
              <InlineMath math={value.replace(/^\/\?\$/, '').replace(/\$$/, '')} />
            </div>
          )}
          {mathError && (
            <p className="text-sm text-red-500">{mathError}</p>
          )}
        </div>
      ) : (
        <Textarea
          ref={textareaRef}
          value={value}
          onChange={handleChange}
          onFocus={handleFocus}
          onPaste={onPaste}
          placeholder={placeholder}
          className={`min-h-[60px] resize-y ${readOnly ? 'focus-visible:ring-0 focus-visible:border-none border-gray-300' : ''}`}
          readOnly={readOnly}
        />
      )}
    </div>
  )
} 