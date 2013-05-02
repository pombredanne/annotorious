goog.provide('annotorious.modules.Module');

/**
 * An base class for Annotorious Module implementations.
 * @constructor
 */
annotorious.modules.Module = function() { }

/**
 * Initializes the module instance's fields. Note that subclasses *must*
 * ensure by themselves that this method is called on initialization.
 * @protected
 */
annotorious.modules.Module.prototype._initFields = function() {
  /** @private **/
  this._annotators = new goog.structs.Map();
  
  /** @private **/
  this._eventHandlers = [];

  /** @private **/
  this._plugins = [];
  
  /** @private **/
  this._allItems = [];
  
  /** @private **/
  this._itemsToLoad = [];
  
  /** @private **/
  this._bufferedForAdding = [];
  
  /** @private **/
  this._bufferedForRemoval = [];

  /** @private **/
  this._isSelectionEnabled = true;
}

/**
 * 
 */
annotorious.modules.Module.prototype._init = function(opt_predef_items) {
  if (opt_predef_items)
    goog.array.extend(this._allItems, opt_predef_items);
  
  if (opt_predef_items)
    goog.array.extend(this._itemsToLoad, opt_predef_items); 

  // Make items in viewport annotatable
  this._lazyLoad();
  
  // Attach a listener to make items annotatable as they scroll into view
  var self = this;
  var key = goog.events.listen(window, goog.events.EventType.SCROLL, function() {
    if (self._itemsToLoad.length > 0)
      self._lazyLoad();
    else
      goog.events.unlistenByKey(key);
  });
}

/**
 * @private
 */
annotorious.modules.Module.prototype._lazyLoad = function() {        
  var self = this;
  goog.array.forEach(this._itemsToLoad, function(item) {
    if (annotorious.dom.isInViewport(item)) {
      self._initAnnotator(item);
    }
  });
}

/**
 * @private
 */
annotorious.modules.Module.prototype._initAnnotator = function(item) {
  var self = this;

  // Keep track of changes
  var addedAnnotations = [];
  var removedAnnotations = [];

  var annotator = this.newAnnotator(item);

  if (!this._isSelectionEnabled)
    annotator.setSelectionEnabled(false);

  var item_src = this.getItemURL(item);

  // Attach handlers that are already registered
  goog.array.forEach(this._eventHandlers, function(eventHandler) {
    annotator.addHandler(eventHandler.type, eventHandler.handler);
  });

  // Callback to registered plugins
  goog.array.forEach(this._plugins, function(plugin) {
    self._initPlugin(plugin, annotator);
  });
            
  // Cross-check with annotation add/remove buffers
  goog.array.forEach(this._bufferedForAdding, function(annotation) {
    if (annotation.src == item_src) {
      annotator.addAnnotation(annotation);
      addedAnnotations.push(annotation);
    }
  });
      
  goog.array.forEach(this._bufferedForRemoval, function(annotation) {
    if (annotation.src == item_src) {
      annotator.removeAnnotation(annotation);
      removedAnnotations.push(annotation);
    }
  });

  // Apply changes
  goog.array.forEach(addedAnnotations, function(annotation) {
    goog.array.remove(self._bufferedForAdding, annotation);
  });
  
  goog.array.forEach(removedAnnotations, function(annotation) {
    goog.array.remove(self._bufferedForRemoval, annotation);
  });
  
  // Update _annotators and _imagesToLoad lists
  this._annotators.set(item_src, annotator);
  goog.array.remove(this._itemsToLoad, item);
}

/**
 * @private
 */
annotorious.modules.Module.prototype._initPlugin = function(plugin, annotator) {
  if (plugin.onInitAnnotator)
    plugin.onInitAnnotator(annotator);
}

/**
 * Adds an annotation to an item managed by this module.
 * @param {Annotation} annotation the annotation
 * @param {Annotation} opt_replace optionally, an existing annotation to replace
 */
annotorious.modules.Module.prototype.addAnnotation = function(annotation, opt_replace) {
  if (this.annotatesItem(annotation.src)) {
    var annotator = this._annotators.get(annotation.src);
    if (annotator) {
      annotator.addAnnotation(annotation, opt_replace)
    } else {
      this._bufferedForAdding.push(annotation);
      if (opt_replace)
        goog.array.remove(this._bufferedForAdding, opt_replace);
    }
  }
}

/**
 * Adds a lifecycle event handler to this module.
 * @param {yuma.events.EventType} type the event type
 * @param {function} handler the handler function
 */
annotorious.modules.Module.prototype.addHandler = function(type, handler) {
  goog.array.forEach(this._annotators.getValues(), function(annotator, idx, array) {
    annotator.addHandler(type, handler);
  });
  
  this._eventHandlers.push({ type: type, handler: handler });
}

/**
 * Adds a plugin to this module.
 * @param {Plugin} plugin the plugin
 */
annotorious.modules.Module.prototype.addPlugin = function(plugin) {
  this._plugins.push(plugin);
  
  var self = this;
  goog.array.forEach(this._annotators.getValues(), function(annotator) {
    self._initPlugin(plugin, annotator);
  });
}

/**
 * Adds a selector to an item managed by this module.
 *
 * !! TEMPORARY !! 
 *
 * TODO selectors should be added to annotators directly, from within a plugin
 * which will make this method unecessary
 */
annotorious.modules.Module.prototype.addSelector = function(item_url, selector) {
  if (this.annotatesItem(item_url)) {
    var annotator = this._annotators.get(item_url);
    if (annotator)
      annotator.addSelector(selector);
  }
}

/**
 * Tests if this module is in charge of managing the item with the specified URL.
 * @param {string} item_url the URL of the item
 * @return {boolean} true if this module is in charge of the media
 */ 
annotorious.modules.Module.prototype.annotatesItem = function(item_url) {
  if (this._annotators.containsKey(item_url)) {
    return true;
  } else {
    var self = this;
    var item = goog.array.find(this._itemsToLoad, function(item) {
      return self.getItemURL(item) == item_url;
    });
    
    return goog.isDefAndNotNull(item);
  }
}

annotorious.modules.Module.prototype.disableSelection = function(opt_item_url) {
  if (opt_item_url) {
    var annotator = this._annotators.get(opt_item_url);
    if (annotator)
      annotator.disableSelection();
  } else {
    goog.array.forEach(this._annotators.getValues(), function(annotator) {
      annotator.disableSelection();
    });
  }
}

annotorious.modules.Module.prototype.enableSelection = function(opt_url_or_param_literal) {
  var item_url;
  if (goog.isString(opt_url_or_param_literal))
    item_url  = opt_url_or_param_literal;
  else if (goog.isObject(opt_url_or_param_literal))
    item_url = opt_url_or_param_literal.item_url;

  if (item_url) {
    var annotator = this._annotators.get(item_url);
    if (annotator)
      annotator.enableSelection(opt_url_or_param_literal);
  } else {
    goog.array.forEach(this._annotators.getValues(), function(annotator) {
      annotator.enableSelection(opt_url_or_param_literal);
    });
  }
}

/**
 * Returns the name of the selector that is currently activated on the item
 * with the specified URL (if managed by this module).
 * @param {string} item_url the URL of the item to query for the active selector
 * @return {string | undefined} the name of the active selector (or undefined)
 */
annotorious.modules.Module.prototype.getActiveSelector = function(item_url) {
  if (this.annotatesItem(item_url)) {
    var annotator = this._annotators.get(item_url);
    if (annotator)
      return annotator.getActiveSelector().getName();
  }
  return undefined;
}

/**
 * Returns all annotations on the item with the specified URL (if managed by this
 * module) or all annotations from this module in case no URL is specified.
 * @param {string | undefined} opt_item_url an item URL (optional)
 * @return {Array.<Annotation>} the annotations
 */
annotorious.modules.Module.prototype.getAnnotations = function(opt_item_url) {
  if (opt_item_url) {
    var annotator = this._annotators.get(opt_item_url);
    if (annotator) {
      return annotator.getAnnotations();
    } else {
      return goog.array.filter(this._bufferedForAdding, function(annotation) {
        return annotation.src == opt_item_url;
      });
    }
  } else {
    var annotations = [];
    goog.array.forEach(this._annotators.getValues(), function(annotator) {
      goog.array.extend(annotations, annotator.getAnnotations());
    });
    goog.array.extend(annotations, this._bufferedForAdding);
    return annotations;
  }
}

/**
 * Returns the list of available shape selectors for a particular item.
 * @param {string} item_url the URL of the item to query for available selectors
 * @returns {List.<string> | undefined} the list of selector names
 */
annotorious.modules.Module.prototype.getAvailableSelectors = function(item_url) {
  if (this.annotatesItem(item_url)) {
    var annotator = this._annotators.get(item_url);
    if (annotator) {
      return goog.array.map(annotator.getAvailableSelectors(), function(selector) {
        return selector.getName();
      });
    }
  }
  return undefined;
}

/**
 * Highlights the specified annotation.
 * @param {Annotation} annotation the annotation
 */
annotorious.modules.Module.prototype.highlightAnnotation = function(annotation) {
  if (annotation) {
    if (this.annotatesItem(annotation.src)) {
      var annotator = this._annotators.get(annotation.src);
      if (annotator)
        annotator.highlightAnnotation(annotation);
    }  
  } else {
    goog.array.forEach(this._annotators.getValues(), function(annotator) {
      annotator.highlightAnnotation();
    });
  }
}

/**
 * Makes an item annotatable, if it is supported by this module.
 * @param {object} item the annotatable item
 */
annotorious.modules.Module.prototype.makeAnnotatable = function(item) {
  if (this.supports(item)) {
    this._allItems.push(item);
    this._initAnnotator(item);
  }
}

/**
 * Removes an annotation from the item with the specified URL.
 * @param {Annotation} annotation the annotation
 */
annotorious.modules.Module.prototype.removeAnnotation = function(annotation) {
  if (this.annotatesItem(annotation.src)) {
    var annotator = this._annotators.get(annotation.src);
    if (annotator)
      annotator.removeAnnotation(annotation);
    else
      this._bufferedForRemoval.push(annotation);
  }
}

/**
 * Sets a specific selector on a particular item.
 * @param {string} item_url the URL of the item on which to set the selector
 * @param {string} selector the name of the selector to set on the item
 */
annotorious.modules.Module.prototype.setActiveSelector = function(item_url, selector) {
  if (this.annotatesItem(item_url)) {
    var annotator = this._annotators.get(item_url);
    if (annotator)
      annotator.setActiveSelector(selector);
  }
}

/**
 * Enables (or disables) the ability to create new annotations on an item.
 * @param {boolean} enabled if true new annotations can be created
 */
annotorious.modules.Module.prototype.setSelectionEnabled = function(enabled) {
  this._isSelectionEnabled = enabled;
  goog.array.forEach(this._annotators.getValues(), function(annotator) {
    annotator.setSelectionEnabled(enabled);
  });
}

/** Methods that must be implemented by subclasses of annotorious.modules.Module **/

/**
 * Returns the identifying URL of the specified item.
 * @param {object} item the item.
 * @return {string} the URL
 */
annotorious.modules.Module.prototype.getItemURL = goog.abstractMethod;

/**
 * This function is called from the framework when the module is initialized.
 * Subclasses of annotorious.modules.Module must perform all subclass-specific
 * initialization actions in this function, and then make sure this._init (note
 * the leading _!) gets called with a list of all items that should be made
 * annotatable immediately!
 */
annotorious.modules.Module.prototype.init = goog.abstractMethod;

/**
 * Returns a new annotator for the specified item.
 * @param {object} item the item
 * @return {object} an annotator for this item
 */
annotorious.modules.Module.prototype.newAnnotator = goog.abstractMethod;

/**
 * Tests if this module supports the specified item's media type.
 * @param {object} item the item
 * @return {boolean} true if this module supports the item
 */
annotorious.modules.Module.prototype.supports = goog.abstractMethod;