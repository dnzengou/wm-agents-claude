'use client';

import { useState, useCallback, useEffect } from 'react';
import type { Command } from '@/types';

export type { Command };

export interface UseCommandPaletteReturn {
  isOpen: boolean;
  searchQuery: string;
  filteredCommands: Command[];
  selectedIndex: number;
  open: () => void;
  close: () => void;
  toggle: () => void;
  setSearchQuery: (query: string) => void;
  selectNext: () => void;
  selectPrevious: () => void;
  executeSelected: () => void;
}

export function useCommandPalette(commands: Command[]): UseCommandPaletteReturn {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Filter commands based on search query
  const filteredCommands = commands.filter(command => {
    const query = searchQuery.toLowerCase();
    return (
      command.title.toLowerCase().includes(query) ||
      command.category.toLowerCase().includes(query)
    );
  });

  // Reset selected index when search changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [searchQuery]);

  // Keyboard shortcut handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd/Ctrl + K to toggle
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        toggle();
      }

      // Escape to close
      if (e.key === 'Escape' && isOpen) {
        close();
      }

      // Navigation when open
      if (isOpen) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          selectNext();
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          selectPrevious();
        }
        if (e.key === 'Enter') {
          e.preventDefault();
          executeSelected();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, filteredCommands, selectedIndex]);

  const open = useCallback(() => {
    setIsOpen(true);
    setSearchQuery('');
    setSelectedIndex(0);
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
    setSearchQuery('');
  }, []);

  const toggle = useCallback(() => {
    if (isOpen) {
      close();
    } else {
      open();
    }
  }, [isOpen, open, close]);

  const selectNext = useCallback(() => {
    setSelectedIndex(prev => 
      prev < filteredCommands.length - 1 ? prev + 1 : prev
    );
  }, [filteredCommands.length]);

  const selectPrevious = useCallback(() => {
    setSelectedIndex(prev => (prev > 0 ? prev - 1 : 0));
  }, []);

  const executeSelected = useCallback(() => {
    const command = filteredCommands[selectedIndex];
    if (command) {
      command.action();
      close();
    }
  }, [filteredCommands, selectedIndex, close]);

  return {
    isOpen,
    searchQuery,
    filteredCommands,
    selectedIndex,
    open,
    close,
    toggle,
    setSearchQuery,
    selectNext,
    selectPrevious,
    executeSelected,
  };
}
