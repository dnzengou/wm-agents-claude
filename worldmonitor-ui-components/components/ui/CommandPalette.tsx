'use client';

import React, { useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';
import type { Command } from '@/types';

export type { Command };

export interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  commands: Command[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  onExecute: () => void;
}

export function CommandPalette({
  isOpen,
  onClose,
  searchQuery,
  onSearchChange,
  commands,
  selectedIndex,
  onSelect,
  onExecute,
}: CommandPaletteProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  // Scroll selected item into view
  useEffect(() => {
    if (listRef.current && selectedIndex >= 0) {
      const selectedElement = listRef.current.children[selectedIndex] as HTMLElement;
      if (selectedElement) {
        selectedElement.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }
  }, [selectedIndex]);

  // Group commands by category
  const groupedCommands = commands.reduce((groups, command) => {
    if (!groups[command.category]) {
      groups[command.category] = [];
    }
    groups[command.category].push(command);
    return groups;
  }, {} as Record<string, Command[]>);

  // Flatten for indexing
  const flatCommands = Object.values(groupedCommands).flat();

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh]"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-obsidian/80 backdrop-blur-sm" />
      
      {/* Modal */}
      <div className="relative w-full max-w-2xl mx-4 bg-void border border-border-default rounded-xl shadow-2xl overflow-hidden animate-fade-in-up">
        {/* Search Input */}
        <div className="p-4 border-b border-border-subtle">
          <div className="relative">
            <svg 
              className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted"
              fill="none" 
              viewBox="0 0 24 24" 
              stroke="currentColor"
            >
              <path 
                strokeLinecap="round" 
                strokeLinejoin="round" 
                strokeWidth={2} 
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" 
              />
            </svg>
            <input
              ref={inputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search commands, data sources, or locations..."
              className="w-full bg-transparent pl-10 pr-4 py-3 text-text-primary placeholder:text-text-muted focus:outline-none text-base"
            />
            <kbd className="absolute right-3 top-1/2 -translate-y-1/2 px-2 py-1 text-xs bg-surface border border-border-default rounded text-text-secondary">
              ESC
            </kbd>
          </div>
        </div>

        {/* Commands List */}
        <div 
          ref={listRef}
          className="max-h-[50vh] overflow-y-auto p-2"
        >
          {commands.length === 0 ? (
            <div className="py-8 text-center text-text-secondary">
              <svg 
                className="w-12 h-12 mx-auto mb-3 text-text-muted"
                fill="none" 
                viewBox="0 0 24 24" 
                stroke="currentColor"
              >
                <path 
                  strokeLinecap="round" 
                  strokeLinejoin="round" 
                  strokeWidth={1.5} 
                  d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" 
                />
              </svg>
              <p className="text-sm">No commands found</p>
              <p className="text-xs text-text-muted mt-1">
                Try a different search term
              </p>
            </div>
          ) : (
            Object.entries(groupedCommands).map(([category, categoryCommands]) => (
              <div key={category} className="mb-2">
                <div className="px-3 py-1.5 text-2xs font-semibold text-text-muted uppercase tracking-wider">
                  {category}
                </div>
                {categoryCommands.map((command) => {
                  const globalIndex = flatCommands.findIndex(c => c.id === command.id);
                  const isSelected = globalIndex === selectedIndex;

                  return (
                    <button
                      key={command.id}
                      onClick={() => {
                        onSelect(globalIndex);
                        onExecute();
                      }}
                      onMouseEnter={() => onSelect(globalIndex)}
                      className={cn(
                        'w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-left transition-colors duration-fast',
                        isSelected 
                          ? 'bg-neon/10 text-text-primary' 
                          : 'text-text-secondary hover:bg-surface hover:text-text-primary'
                      )}
                    >
                      {command.icon && (
                        <span className={cn(
                          'flex-shrink-0',
                          isSelected ? 'text-neon' : 'text-text-muted'
                        )}>
                          {command.icon}
                        </span>
                      )}
                      <span className="flex-1 text-sm">{command.title}</span>
                      {command.shortcut && (
                        <kbd className={cn(
                          'px-2 py-0.5 text-xs border rounded',
                          isSelected 
                            ? 'border-neon/30 text-neon' 
                            : 'border-border-default text-text-muted'
                        )}>
                          {command.shortcut}
                        </kbd>
                      )}
                      {isSelected && (
                        <svg 
                          className="w-4 h-4 text-neon flex-shrink-0" 
                          fill="none" 
                          viewBox="0 0 24 24" 
                          stroke="currentColor"
                        >
                          <path 
                            strokeLinecap="round" 
                            strokeLinejoin="round" 
                            strokeWidth={2} 
                            d="M9 5l7 7-7 7" 
                          />
                        </svg>
                      )}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 bg-surface border-t border-border-subtle flex items-center justify-between text-xs text-text-muted">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-void border border-border-default rounded">↑</kbd>
              <kbd className="px-1.5 py-0.5 bg-void border border-border-default rounded">↓</kbd>
              <span className="ml-1">to navigate</span>
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-void border border-border-default rounded">↵</kbd>
              <span className="ml-1">to select</span>
            </span>
          </div>
          <span>{commands.length} commands</span>
        </div>
      </div>
    </div>
  );
}
