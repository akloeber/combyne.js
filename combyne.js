/* combyne.js v0.3.0
 * Copyright 2013, Tim Branyen (@tbranyen)
 * combyne.js may be freely distributed under the MIT license.
 */
(function(window) {
"use strict";

// Normalize the `define` and `require` calls.
var require = window.require || function() {};
// Call the exports function or the crafted one with the Node.js `require`.
var define = window.define || function(cb) {
  window.combyne = cb.call(this, require);
};

// Define the module contents.
define(function(require) {

var _tokens, nextToken, lastToken;
var toString = Object.prototype.toString;
var specialCharsExp = /[\^$\\\/.*+?()\[\]{}|]/g;
var templateStack = [];

function render(self, context, stack, delimiters) {
  var tmpVar, method, args;
  var token = stack.pop();
  var capture = token.captures[0];

  switch(token.name) {
    case "WHITESPACE":
      templateStack.push("'" + capture + "'");

      break;
      
    case "COMMENT":
      if (lastToken === "START_EXPR") {
        templateStack.push("\/*");

      } else if (nextToken === "END_EXPR") {
        templateStack.push("*\/");

      } else {
        templateStack.push("'" + delimiters.COMMENT + "'");
      }

      break;

    case "OTHER":
      if (lastToken === "START_PROP") {
        templateStack.push("typeof " + capture + " == 'function' ? " +
          capture + "() : " + capture);

      } else {
        templateStack.push("'" + capture + "'");
      }

      break;
  }

  // Parse the token stack until it's empty
  if (stack.length) {
    lastToken = token.name;
    nextToken = stack[0].name;

    return render(self, context, stack, delimiters);
  }

  // Return value
  return templateStack;
}

// Convenience method to wrap a passed filter to have the correct context.
function _wrapFilter(self, func) {
  return function() {
    return func.apply({ original: self.template }, arguments);
  };
}

// Escape any delimiters assigned
function escDelimiter(delimiter) {
  return delimiter.replace(specialCharsExp,"\\$&");
}

// Object.keys polyfill
function getKeys(obj) {
  var key;
  var array = [];
  
  for (key in obj) {
    if (!obj.hasOwnProperty(key)) {
      continue;
    }

    array.push(key);
  }

  return array;
}

// Minimalist extend function, thanks jdalton
function extend(destination) { 
  var prop, source;
  var index = 0;
  var length = arguments.length;

  while (++index < length) {
    source = arguments[index];

    for (prop in source) {
      destination[prop] = source[prop];
    }
  }

  return destination;
}

// Highly experimental compile function
function compile(stack) {
  var i;
  var actions = "";

  for (i=0; i<stack.length; i++) {
    actions += "stack.push(" + (typeof stack[i] === "string" ? "unescape("+escape(stack[i])+")" : stack[i]) + ");";
  }

  return new Function("data, contents", [

    "var stack = [];",

    "try {",
      "with (data || {}) {",
        stack.join(""),
      "}",
    "} catch (ex) {};",

    "return stack.join('');"

  ].join("\n"));
}

// Tokenizer
function tokenizer(template, stack, tokens) {
  _tokens = tokens = tokens || _tokens;

  var i, captures, token, key;
  var keys = getKeys(tokens);
  var len = keys.length;

  while (template.length) {
    for (i=0; i<len; i++) {
      key = keys[i];

      if (captures = tokens[key].exec(template)) {
        token = { name: key, captures: captures };
        template = template.replace(tokens[key], "");

        if (captures[0]) {
          stack.push(token);
        }
      }
    }
  }
}

function main(self, template, context, delimiters) {
  var string, sp, ep, se, ee, co, fi;
  var error = 0;
  var stack = [];
  var grammar = {};

  sp = escDelimiter(delimiters.START_PROP);
  ep = escDelimiter(delimiters.END_PROP);
  se = escDelimiter(delimiters.START_EXPR);
  ee = escDelimiter(delimiters.END_EXPR);
  co = escDelimiter(delimiters.COMMENT);
  fi = escDelimiter(delimiters.FILTER);

  grammar.START_PROP = new RegExp("^" + sp);
  grammar.END_PROP = new RegExp("^" + ep);
  grammar.START_EXPR = new RegExp("^" + se);
  grammar.END_EXPR = new RegExp("^" + ee);
  grammar.COMMENT = new RegExp("^" + co);
  grammar.FILTER = new RegExp("^" + fi);

  string = [ sp, ep, se, ee, co, fi ].join("|");

  grammar.WHITESPACE = /^[\ |\t|\r|\n]+/;
  grammar.OTHER = new RegExp("^((?!" + string + ").)*");

  if (error = tokenizer(template, stack, grammar)) {
    if (self.debug) {
      throw new Error(error);
    }
  }

  stack.reverse();

  return render(self, context, stack, delimiters);
}

function Combyne(template, context) {
  if (!(this instanceof Combyne)) {
    return new Combyne(template, context);
  }

  this.template = template;
  this.context = context || {};

  function addon() {
    return {
      _cache: {},
      // Read
      get: function(name) {
        return this._cache[name];
      },
      // Delete
      remove: function(name) {
        delete this._cache[name];
      }
    };
  }

  this.filters = addon();
  this.filters.add = function(name, cb) {
    this._cache[name] = _wrapFilter(this, cb);
  };

  this.partials = addon();
  this.partials.add = function(name, template, context) {
    this._cache[name] = { template: template, context: context };
  };

  // Create a reusable render method.
  var render = function(context) {
    return this.render(context);
  }.bind(this);

  // Ensure `instanceof` still works.
  render.__proto__ = this;

  return render;
}

Combyne.VERSION = "0.3.0";
Combyne.prototype = {
  render: function(context) {
    // Missing template or context... can't exactly do anything here...
    if (!this.template || !this.context) {
      if (this.debug) {
        throw new Error("Missing template or context");
      }
    } 

    // Override delimiters
    this.delimiters = extend({}, this.delimiters, {
      START_PROP: "{{",
      END_PROP: "}}",
      START_EXPR: "{%",
      END_EXPR: "%}",
      COMMENT: "--",
      FILTER: "|"
    });

    // Actually render
    var stack = main(this, this.template, this.context, this.delimiters);

    // Clean up stack
    templateStack = [];
    nextToken = "";
    lastToken = "";

    return compile(stack)(this.context);
  },

  delimiters: {}
};

return Combyne;

});

})(typeof global !== "undefined" ? global : this);
