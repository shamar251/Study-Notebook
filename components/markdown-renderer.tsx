"use client"

import { useEffect, useState } from "react"

interface MarkdownRendererProps {
  content: string
}

export default function MarkdownRenderer({ content }: MarkdownRendererProps) {
  const [html, setHtml] = useState("")

  useEffect(() => {
    // This is a simple markdown parser for demonstration
    // In a real app, you'd use a library like marked or remark
    const parseMarkdown = (markdown: string) => {
      const parsed = markdown
        // Headers
        .replace(/^# (.*$)/gm, '<h1 class="text-2xl font-bold my-3">$1</h1>')
        .replace(/^## (.*$)/gm, '<h2 class="text-xl font-bold my-2">$1</h2>')
        .replace(/^### (.*$)/gm, '<h3 class="text-lg font-bold my-2">$1</h3>')
        // Bold
        .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
        // Italic
        .replace(/\*(.*?)\*/g, "<em>$1</em>")
        // Lists
        .replace(/^\s*- (.*$)/gm, '<li class="ml-4">$1</li>')
        // Links
        .replace(/\[([^\]]+)\]$$([^)]+)$$/g, '<a href="$2" class="text-blue-500 hover:underline">$1</a>')
        // Paragraphs
        .replace(/^(?!<[hl]|<li)(.+)$/gm, '<p class="my-2">$1</p>')
        // Line breaks
        .replace(/\n\n/g, "<br />")

      return parsed
    }

    setHtml(parseMarkdown(content))
  }, [content])

  return <div className="prose dark:prose-invert max-w-none" dangerouslySetInnerHTML={{ __html: html }} />
}
