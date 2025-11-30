/**
 * EventManager - Centralized event handling with automatic cleanup
 * Prevents memory leaks by tracking all event listeners and removing them on disposal
 */
export class EventManager {
  constructor() {
    // Track all active listeners for cleanup
    this.listeners = new Set();
    // Group listeners by context for partial cleanup
    this.contextGroups = new Map();
    // Track bound handlers to prevent duplicate bindings
    this.boundHandlers = new WeakMap();
  }

  /**
   * Add an event listener with automatic tracking
   * @param {EventTarget} target - DOM element or object to attach listener to
   * @param {string} event - Event name
   * @param {Function} handler - Event handler function
   * @param {Object} options - addEventListener options
   * @param {string} context - Optional context for grouping listeners
   * @returns {Function} The bound handler function
   */
  add(target, event, handler, options = {}, context = 'default') {
    // Check if handler already bound for this target
    let boundHandler = handler;

    if (!this.boundHandlers.has(handler)) {
      this.boundHandlers.set(handler, new WeakMap());
    }

    const targetMap = this.boundHandlers.get(handler);
    if (!targetMap.has(target)) {
      boundHandler = handler.bind(options.bindContext || null);
      targetMap.set(target, boundHandler);
    } else {
      boundHandler = targetMap.get(target);
    }

    // Add the listener
    target.addEventListener(event, boundHandler, options);

    // Track the listener
    const listenerInfo = {
      target,
      event,
      handler: boundHandler,
      originalHandler: handler,
      options: options.capture || false // Store capture flag for removal
    };

    this.listeners.add(listenerInfo);

    // Add to context group
    if (!this.contextGroups.has(context)) {
      this.contextGroups.set(context, new Set());
    }
    this.contextGroups.get(context).add(listenerInfo);

    return boundHandler;
  }

  /**
   * Remove a specific event listener
   * @param {EventTarget} target - Target to remove listener from
   * @param {string} event - Event name
   * @param {Function} handler - Original handler function
   */
  remove(target, event, handler) {
    // Find the listener info
    let listenerToRemove = null;

    for (const listener of this.listeners) {
      if (listener.target === target &&
          listener.event === event &&
          listener.originalHandler === handler) {
        listenerToRemove = listener;
        break;
      }
    }

    if (listenerToRemove) {
      // Remove from DOM
      target.removeEventListener(
        event,
        listenerToRemove.handler,
        listenerToRemove.options
      );

      // Remove from tracking
      this.listeners.delete(listenerToRemove);

      // Remove from context groups
      for (const group of this.contextGroups.values()) {
        group.delete(listenerToRemove);
      }
    }
  }

  /**
   * Remove all listeners in a specific context
   * @param {string} context - Context name to clear
   */
  removeContext(context) {
    const group = this.contextGroups.get(context);
    if (!group) return;

    for (const listener of group) {
      listener.target.removeEventListener(
        listener.event,
        listener.handler,
        listener.options
      );
      this.listeners.delete(listener);
    }

    this.contextGroups.delete(context);
  }

  /**
   * Remove all listeners for a specific target
   * @param {EventTarget} target - Target to remove all listeners from
   */
  removeTarget(target) {
    const toRemove = [];

    for (const listener of this.listeners) {
      if (listener.target === target) {
        toRemove.push(listener);
      }
    }

    for (const listener of toRemove) {
      listener.target.removeEventListener(
        listener.event,
        listener.handler,
        listener.options
      );
      this.listeners.delete(listener);

      // Remove from context groups
      for (const group of this.contextGroups.values()) {
        group.delete(listener);
      }
    }
  }

  /**
   * Remove all tracked event listeners
   */
  removeAll() {
    for (const listener of this.listeners) {
      listener.target.removeEventListener(
        listener.event,
        listener.handler,
        listener.options
      );
    }

    this.listeners.clear();
    this.contextGroups.clear();
  }

  /**
   * Get statistics about tracked listeners
   * @returns {Object} Statistics object
   */
  getStats() {
    const stats = {
      totalListeners: this.listeners.size,
      contexts: {},
      targets: new Map()
    };

    // Count by context
    for (const [context, group] of this.contextGroups) {
      stats.contexts[context] = group.size;
    }

    // Count by target
    for (const listener of this.listeners) {
      const target = listener.target;
      const key = target.constructor.name || 'Unknown';
      stats.targets.set(key, (stats.targets.get(key) || 0) + 1);
    }

    return stats;
  }

  /**
   * Dispose of the EventManager and clean up all listeners
   */
  dispose() {
    this.removeAll();
    this.boundHandlers = new WeakMap();
  }
}

// Singleton instance for global event management
let globalInstance = null;

/**
 * Get or create the global EventManager instance
 * @returns {EventManager} The global instance
 */
export function getGlobalEventManager() {
  if (!globalInstance) {
    globalInstance = new EventManager();
  }
  return globalInstance;
}

// Auto-cleanup on page unload
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    if (globalInstance) {
      globalInstance.dispose();
    }
  });
}