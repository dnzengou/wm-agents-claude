'use client';

import React, { useState } from 'react';
import { cn } from '@/lib/utils';
import { Badge } from '../ui/Badge';

export interface Layer {
  id: string;
  name: string;
  category: string;
  enabled: boolean;
  count?: number;
  icon?: React.ReactNode;
  color?: string;
}

export interface LayerControlProps {
  layers: Layer[];
  onToggleLayer: (layerId: string) => void;
  onToggleCategory: (category: string, enabled: boolean) => void;
  className?: string;
}

export function LayerControl({
  layers,
  onToggleLayer,
  onToggleCategory,
  className,
}: LayerControlProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    new Set([...new Set(layers.map(l => l.category))])
  );

  // Group layers by category
  const groupedLayers = layers.reduce((groups, layer) => {
    if (!groups[layer.category]) {
      groups[layer.category] = [];
    }
    groups[layer.category].push(layer);
    return groups;
  }, {} as Record<string, Layer[]>);

  const toggleCategory = (category: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  };

  const getCategoryCount = (category: string) => {
    return groupedLayers[category]?.filter(l => l.enabled).length || 0;
  };

  const getTotalEnabled = () => {
    return layers.filter(l => l.enabled).length;
  };

  return (
    <div className={cn('relative', className)}>
      {/* Toggle Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'flex items-center gap-2 px-3 py-2 rounded-md border transition-all duration-fast',
          isOpen 
            ? 'bg-accent-cyan/10 border-accent-cyan/50 text-accent-cyan' 
            : 'bg-bg-secondary border-border-default text-text-secondary hover:text-text-primary hover:border-border-strong'
        )}
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
        </svg>
        <span className="text-sm font-medium">Layers</span>
        {getTotalEnabled() > 0 && (
          <Badge variant="cyan" className="ml-1">
            {getTotalEnabled()}
          </Badge>
        )}
      </button>

      {/* Dropdown Panel */}
      {isOpen && (
        <>
          {/* Backdrop */}
          <div 
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />

          {/* Panel */}
          <div className="absolute top-full left-0 mt-2 w-72 bg-bg-secondary border border-border-default rounded-lg shadow-xl z-50 animate-fade-in-up">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border-subtle">
              <span className="text-sm font-semibold text-text-primary">Map Layers</span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => onToggleCategory('all', true)}
                  className="px-2 py-1 text-xs text-accent-cyan hover:bg-accent-cyan/10 rounded transition-colors"
                >
                  All
                </button>
                <button
                  onClick={() => onToggleCategory('all', false)}
                  className="px-2 py-1 text-xs text-text-tertiary hover:text-text-primary hover:bg-bg-tertiary rounded transition-colors"
                >
                  None
                </button>
              </div>
            </div>

            {/* Categories */}
            <div className="max-h-96 overflow-y-auto p-2">
              {Object.entries(groupedLayers).map(([category, categoryLayers]) => {
                const isExpanded = expandedCategories.has(category);
                const enabledCount = getCategoryCount(category);

                return (
                  <div key={category} className="mb-2">
                    {/* Category Header */}
                    <button
                      onClick={() => toggleCategory(category)}
                      className="w-full flex items-center justify-between px-2 py-2 rounded-md hover:bg-bg-tertiary transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <svg 
                          className={cn(
                            'w-4 h-4 text-text-tertiary transition-transform duration-fast',
                            isExpanded && 'rotate-90'
                          )} 
                          fill="none" 
                          viewBox="0 0 24 24" 
                          stroke="currentColor"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                        <span className="text-sm font-medium text-text-primary">{category}</span>
                        {enabledCount > 0 && (
                          <Badge variant="default" className="text-2xs">
                            {enabledCount}
                          </Badge>
                        )}
                      </div>
                    </button>

                    {/* Layer Items */}
                    {isExpanded && (
                      <div className="ml-6 mt-1 space-y-0.5">
                        {categoryLayers.map(layer => (
                          <label
                            key={layer.id}
                            className="flex items-center gap-3 px-2 py-2 rounded-md hover:bg-bg-tertiary cursor-pointer transition-colors group"
                          >
                            <input
                              type="checkbox"
                              checked={layer.enabled}
                              onChange={() => onToggleLayer(layer.id)}
                              className="w-4 h-4 rounded border-border-default bg-bg-tertiary text-accent-cyan focus:ring-accent-cyan/20 focus:ring-2"
                            />
                            <div className="flex items-center gap-2 flex-1">
                              {layer.color && (
                                <span 
                                  className="w-3 h-3 rounded-full flex-shrink-0"
                                  style={{ backgroundColor: layer.color }}
                                />
                              )}
                              {layer.icon && (
                                <span className="text-text-tertiary group-hover:text-text-secondary">
                                  {layer.icon}
                                </span>
                              )}
                              <span className={cn(
                                'text-sm',
                                layer.enabled ? 'text-text-primary' : 'text-text-secondary'
                              )}>
                                {layer.name}
                              </span>
                            </div>
                            {layer.count !== undefined && (
                              <span className="text-xs text-text-tertiary font-mono">
                                {layer.count.toLocaleString()}
                              </span>
                            )}
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Footer */}
            <div className="px-4 py-2 border-t border-border-subtle bg-bg-tertiary rounded-b-lg">
              <div className="flex items-center justify-between text-xs text-text-tertiary">
                <span>{getTotalEnabled()} of {layers.length} active</span>
                <button 
                  onClick={() => setIsOpen(false)}
                  className="text-accent-cyan hover:underline"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
