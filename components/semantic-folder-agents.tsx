"use client"

import React from "react"
import { Bot } from "lucide-react"

export default function SemanticFolderAgents() {
  return (
    <div className="flex flex-col h-full w-full bg-background">
      <div className="flex items-center gap-3 mb-2 pt-6 pl-8">
        <Bot className="w-7 h-7 text-primary" />
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Semantic Folder Agents</h1>
      </div>
      <div className="pl-8 pr-8 max-w-4xl">
        <p className="text-gray-600 dark:text-gray-300 mb-6">
          This page will host the interface for managing and interacting with semantic folder agents. Here you will be able to create, configure, and run agents that operate on your folders and notes. (WIP)
        </p>
        {/* TODO: Add folder agent list, creation, and interaction UI here */}
        <div className="rounded-lg border border-dashed border-gray-300 dark:border-gray-700 p-8 text-center text-gray-400 dark:text-gray-500">
          Folder agent features coming soon...
        </div>
      </div>
    </div>
  )
} 