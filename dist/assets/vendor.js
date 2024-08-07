window.EmberENV={ ...(window.EmberENV || {}), ...{
  "EXTEND_PROTOTYPES": false,
  "FEATURES": {},
  "_APPLICATION_TEMPLATE_WRAPPER": false,
  "_DEFAULT_ASYNC_OBSERVERS": true,
  "_JQUERY_INTEGRATION": false,
  "_NO_IMPLICIT_ROUTE_MODEL": true,
  "_TEMPLATE_ONLY_GLIMMER_COMPONENTS": true
} };var runningTests=false;var loader, define, requireModule, require, requirejs;

(function (global) {
  'use strict';

  function dict() {
    var obj = Object.create(null);
    obj['__'] = undefined;
    delete obj['__'];
    return obj;
  }

  // Save off the original values of these globals, so we can restore them if someone asks us to
  var oldGlobals = {
    loader: loader,
    define: define,
    requireModule: requireModule,
    require: require,
    requirejs: requirejs
  };

  requirejs = require = requireModule = function (id) {
    var pending = [];
    var mod = findModule(id, '(require)', pending);

    for (var i = pending.length - 1; i >= 0; i--) {
      pending[i].exports();
    }

    return mod.module.exports;
  };

  loader = {
    noConflict: function (aliases) {
      var oldName, newName;

      for (oldName in aliases) {
        if (aliases.hasOwnProperty(oldName)) {
          if (oldGlobals.hasOwnProperty(oldName)) {
            newName = aliases[oldName];

            global[newName] = global[oldName];
            global[oldName] = oldGlobals[oldName];
          }
        }
      }
    },
    // Option to enable or disable the generation of default exports
    makeDefaultExport: true
  };

  var registry = dict();
  var seen = dict();

  var uuid = 0;

  function unsupportedModule(length) {
    throw new Error('an unsupported module was defined, expected `define(id, deps, module)` instead got: `' + length + '` arguments to define`');
  }

  var defaultDeps = ['require', 'exports', 'module'];

  function Module(id, deps, callback, alias) {
    this.uuid = uuid++;
    this.id = id;
    this.deps = !deps.length && callback.length ? defaultDeps : deps;
    this.module = { exports: {} };
    this.callback = callback;
    this.hasExportsAsDep = false;
    this.isAlias = alias;
    this.reified = new Array(deps.length);

    /*
       Each module normally passes through these states, in order:
         new       : initial state
         pending   : this module is scheduled to be executed
         reifying  : this module's dependencies are being executed
         reified   : this module's dependencies finished executing successfully
         errored   : this module's dependencies failed to execute
         finalized : this module executed successfully
     */
    this.state = 'new';
  }

  Module.prototype.makeDefaultExport = function () {
    var exports = this.module.exports;
    if (exports !== null && (typeof exports === 'object' || typeof exports === 'function') && exports['default'] === undefined && Object.isExtensible(exports)) {
      exports['default'] = exports;
    }
  };

  Module.prototype.exports = function () {
    // if finalized, there is no work to do. If reifying, there is a
    // circular dependency so we must return our (partial) exports.
    if (this.state === 'finalized' || this.state === 'reifying') {
      return this.module.exports;
    }


    if (loader.wrapModules) {
      this.callback = loader.wrapModules(this.id, this.callback);
    }

    this.reify();

    var result = this.callback.apply(this, this.reified);
    this.reified.length = 0;
    this.state = 'finalized';

    if (!(this.hasExportsAsDep && result === undefined)) {
      this.module.exports = result;
    }
    if (loader.makeDefaultExport) {
      this.makeDefaultExport();
    }
    return this.module.exports;
  };

  Module.prototype.unsee = function () {
    this.state = 'new';
    this.module = { exports: {} };
  };

  Module.prototype.reify = function () {
    if (this.state === 'reified') {
      return;
    }
    this.state = 'reifying';
    try {
      this.reified = this._reify();
      this.state = 'reified';
    } finally {
      if (this.state === 'reifying') {
        this.state = 'errored';
      }
    }
  };

  Module.prototype._reify = function () {
    var reified = this.reified.slice();
    for (var i = 0; i < reified.length; i++) {
      var mod = reified[i];
      reified[i] = mod.exports ? mod.exports : mod.module.exports();
    }
    return reified;
  };

  Module.prototype.findDeps = function (pending) {
    if (this.state !== 'new') {
      return;
    }

    this.state = 'pending';

    var deps = this.deps;

    for (var i = 0; i < deps.length; i++) {
      var dep = deps[i];
      var entry = this.reified[i] = { exports: undefined, module: undefined };
      if (dep === 'exports') {
        this.hasExportsAsDep = true;
        entry.exports = this.module.exports;
      } else if (dep === 'require') {
        entry.exports = this.makeRequire();
      } else if (dep === 'module') {
        entry.exports = this.module;
      } else {
        entry.module = findModule(resolve(dep, this.id), this.id, pending);
      }
    }
  };

  Module.prototype.makeRequire = function () {
    var id = this.id;
    var r = function (dep) {
      return require(resolve(dep, id));
    };
    r['default'] = r;
    r.moduleId = id;
    r.has = function (dep) {
      return has(resolve(dep, id));
    };
    return r;
  };

  define = function (id, deps, callback) {
    var module = registry[id];

    // If a module for this id has already been defined and is in any state
    // other than `new` (meaning it has been or is currently being required),
    // then we return early to avoid redefinition.
    if (module && module.state !== 'new') {
      return;
    }

    if (arguments.length < 2) {
      unsupportedModule(arguments.length);
    }

    if (!Array.isArray(deps)) {
      callback = deps;
      deps = [];
    }

    if (callback instanceof Alias) {
      registry[id] = new Module(callback.id, deps, callback, true);
    } else {
      registry[id] = new Module(id, deps, callback, false);
    }
  };

  define.exports = function (name, defaultExport) {
    var module = registry[name];

    // If a module for this name has already been defined and is in any state
    // other than `new` (meaning it has been or is currently being required),
    // then we return early to avoid redefinition.
    if (module && module.state !== 'new') {
      return;
    }

    module = new Module(name, [], noop, null);
    module.module.exports = defaultExport;
    module.state = 'finalized';
    registry[name] = module;

    return module;
  };

  function noop() {}
  // we don't support all of AMD
  // define.amd = {};

  function Alias(id) {
    this.id = id;
  }

  define.alias = function (id, target) {
    if (arguments.length === 2) {
      return define(target, new Alias(id));
    }

    return new Alias(id);
  };

  function missingModule(id, referrer) {
    throw new Error('Could not find module `' + id + '` imported from `' + referrer + '`');
  }

  function findModule(id, referrer, pending) {
    var mod = registry[id] || registry[id + '/index'];

    while (mod && mod.isAlias) {
      mod = registry[mod.id] || registry[mod.id + '/index'];
    }

    if (!mod) {
      missingModule(id, referrer);
    }

    if (pending && mod.state !== 'pending' && mod.state !== 'finalized') {
      mod.findDeps(pending);
      pending.push(mod);
    }
    return mod;
  }

  function resolve(child, id) {
    if (child.charAt(0) !== '.') {
      return child;
    }


    var parts = child.split('/');
    var nameParts = id.split('/');
    var parentBase = nameParts.slice(0, -1);

    for (var i = 0, l = parts.length; i < l; i++) {
      var part = parts[i];

      if (part === '..') {
        if (parentBase.length === 0) {
          throw new Error('Cannot access parent module of root');
        }
        parentBase.pop();
      } else if (part === '.') {
        continue;
      } else {
        parentBase.push(part);
      }
    }

    return parentBase.join('/');
  }

  function has(id) {
    return !!(registry[id] || registry[id + '/index']);
  }

  requirejs.entries = requirejs._eak_seen = registry;
  requirejs.has = has;
  requirejs.unsee = function (id) {
    findModule(id, '(unsee)', false).unsee();
  };

  requirejs.clear = function () {
    requirejs.entries = requirejs._eak_seen = registry = dict();
    seen = dict();
  };

  // This code primes the JS engine for good performance by warming the
  // JIT compiler for these functions.
  define('foo', function () {});
  define('foo/bar', [], function () {});
  define('foo/asdf', ['module', 'exports', 'require'], function (module, exports, require) {
    if (require.has('foo/bar')) {
      require('foo/bar');
    }
  });
  define('foo/baz', [], define.alias('foo'));
  define('foo/quz', define.alias('foo'));
  define.alias('foo', 'foo/qux');
  define('foo/bar', ['foo', './quz', './baz', './asdf', './bar', '../foo'], function () {});
  define('foo/main', ['foo/bar'], function () {});
  define.exports('foo/exports', {});

  require('foo/exports');
  require('foo/main');
  require.unsee('foo/bar');

  requirejs.clear();

  if (typeof exports === 'object' && typeof module === 'object' && module.exports) {
    module.exports = { require: require, define: define };
  }
})(this);if (typeof FastBoot === 'undefined') {
      var preferNative = false;
      (function (originalGlobal) {
  define('fetch', ['exports', 'ember', 'rsvp'], function (exports, Ember__module, RSVP__module) {
    'use strict';

    var Ember = 'default' in Ember__module ? Ember__module['default'] : Ember__module;
    var RSVP = 'default' in RSVP__module ? RSVP__module['default'] : RSVP__module;
    var Promise = RSVP.Promise;
    var supportProps = ['FormData', 'FileReader', 'Blob', 'URLSearchParams', 'Symbol', 'ArrayBuffer'];
    var polyfillProps = ['fetch', 'Headers', 'Request', 'Response', 'AbortController'];
    var combinedProps = supportProps;
    if (preferNative) {
      combinedProps = supportProps.concat(polyfillProps);
    }
    combinedProps.forEach(function (prop) {
      if (originalGlobal[prop]) {
        Object.defineProperty(exports, prop, {
          configurable: true,
          get: function () {
            return originalGlobal[prop];
          },
          set: function (v) {
            originalGlobal[prop] = v;
          }
        });
      }
    });

    // shadow github/fetch global object
    // https://github.com/github/fetch/blob/v3.4.0/fetch.js
    var globalThis = exports;
    // shadow mo/abortcontroller-polyfill global object
    // https://github.com/mo/abortcontroller-polyfill/blob/v1.4.0/src/abortcontroller-polyfill.js
    var self = exports;
    (function () {
      'use strict';

      class Emitter {
        constructor() {
          Object.defineProperty(this, 'listeners', {
            value: {},
            writable: true,
            configurable: true
          });
        }
        addEventListener(type, callback, options) {
          if (!(type in this.listeners)) {
            this.listeners[type] = [];
          }
          this.listeners[type].push({
            callback,
            options
          });
        }
        removeEventListener(type, callback) {
          if (!(type in this.listeners)) {
            return;
          }
          const stack = this.listeners[type];
          for (let i = 0, l = stack.length; i < l; i++) {
            if (stack[i].callback === callback) {
              stack.splice(i, 1);
              return;
            }
          }
        }
        dispatchEvent(event) {
          if (!(event.type in this.listeners)) {
            return;
          }
          const stack = this.listeners[event.type];
          const stackToCall = stack.slice();
          for (let i = 0, l = stackToCall.length; i < l; i++) {
            const listener = stackToCall[i];
            try {
              listener.callback.call(this, event);
            } catch (e) {
              Promise.resolve().then(() => {
                throw e;
              });
            }
            if (listener.options && listener.options.once) {
              this.removeEventListener(event.type, listener.callback);
            }
          }
          return !event.defaultPrevented;
        }
      }
      class AbortSignal extends Emitter {
        constructor() {
          super();
          // Some versions of babel does not transpile super() correctly for IE <= 10, if the parent
          // constructor has failed to run, then "this.listeners" will still be undefined and then we call
          // the parent constructor directly instead as a workaround. For general details, see babel bug:
          // https://github.com/babel/babel/issues/3041
          // This hack was added as a fix for the issue described here:
          // https://github.com/Financial-Times/polyfill-library/pull/59#issuecomment-477558042
          if (!this.listeners) {
            Emitter.call(this);
          }

          // Compared to assignment, Object.defineProperty makes properties non-enumerable by default and
          // we want Object.keys(new AbortController().signal) to be [] for compat with the native impl
          Object.defineProperty(this, 'aborted', {
            value: false,
            writable: true,
            configurable: true
          });
          Object.defineProperty(this, 'onabort', {
            value: null,
            writable: true,
            configurable: true
          });
          Object.defineProperty(this, 'reason', {
            value: undefined,
            writable: true,
            configurable: true
          });
        }
        toString() {
          return '[object AbortSignal]';
        }
        dispatchEvent(event) {
          if (event.type === 'abort') {
            this.aborted = true;
            if (typeof this.onabort === 'function') {
              this.onabort.call(this, event);
            }
          }
          super.dispatchEvent(event);
        }
      }
      class AbortController {
        constructor() {
          // Compared to assignment, Object.defineProperty makes properties non-enumerable by default and
          // we want Object.keys(new AbortController()) to be [] for compat with the native impl
          Object.defineProperty(this, 'signal', {
            value: new AbortSignal(),
            writable: true,
            configurable: true
          });
        }
        abort(reason) {
          let event;
          try {
            event = new Event('abort');
          } catch (e) {
            if (typeof document !== 'undefined') {
              if (!document.createEvent) {
                // For Internet Explorer 8:
                event = document.createEventObject();
                event.type = 'abort';
              } else {
                // For Internet Explorer 11:
                event = document.createEvent('Event');
                event.initEvent('abort', false, false);
              }
            } else {
              // Fallback where document isn't available:
              event = {
                type: 'abort',
                bubbles: false,
                cancelable: false
              };
            }
          }
          let signalReason = reason;
          if (signalReason === undefined) {
            if (typeof document === 'undefined') {
              signalReason = new Error('This operation was aborted');
              signalReason.name = 'AbortError';
            } else {
              try {
                signalReason = new DOMException('signal is aborted without reason');
              } catch (err) {
                // IE 11 does not support calling the DOMException constructor, use a
                // regular error object on it instead.
                signalReason = new Error('This operation was aborted');
                signalReason.name = 'AbortError';
              }
            }
          }
          this.signal.reason = signalReason;
          this.signal.dispatchEvent(event);
        }
        toString() {
          return '[object AbortController]';
        }
      }
      if (typeof Symbol !== 'undefined' && Symbol.toStringTag) {
        // These are necessary to make sure that we get correct output for:
        // Object.prototype.toString.call(new AbortController())
        AbortController.prototype[Symbol.toStringTag] = 'AbortController';
        AbortSignal.prototype[Symbol.toStringTag] = 'AbortSignal';
      }
      function polyfillNeeded(self) {
        if (self.__FORCE_INSTALL_ABORTCONTROLLER_POLYFILL) {
          console.log('__FORCE_INSTALL_ABORTCONTROLLER_POLYFILL=true is set, will force install polyfill');
          return true;
        }

        // Note that the "unfetch" minimal fetch polyfill defines fetch() without
        // defining window.Request, and this polyfill need to work on top of unfetch
        // so the below feature detection needs the !self.AbortController part.
        // The Request.prototype check is also needed because Safari versions 11.1.2
        // up to and including 12.1.x has a window.AbortController present but still
        // does NOT correctly implement abortable fetch:
        // https://bugs.webkit.org/show_bug.cgi?id=174980#c2
        return typeof self.Request === 'function' && !self.Request.prototype.hasOwnProperty('signal') || !self.AbortController;
      }
      (function (self) {
        if (!polyfillNeeded(self)) {
          return;
        }
        self.AbortController = AbortController;
        self.AbortSignal = AbortSignal;
      })(typeof self !== 'undefined' ? self : global);
    })();
    var WHATWGFetch = function (exports) {
      'use strict';

      /* eslint-disable no-prototype-builtins */
      var g = typeof globalThis !== 'undefined' && globalThis || typeof self !== 'undefined' && self ||
      // eslint-disable-next-line no-undef
      typeof global !== 'undefined' && global || {};
      var support = {
        searchParams: 'URLSearchParams' in g,
        iterable: 'Symbol' in g && 'iterator' in Symbol,
        blob: 'FileReader' in g && 'Blob' in g && function () {
          try {
            new Blob();
            return true;
          } catch (e) {
            return false;
          }
        }(),
        formData: 'FormData' in g,
        arrayBuffer: 'ArrayBuffer' in g
      };
      function isDataView(obj) {
        return obj && DataView.prototype.isPrototypeOf(obj);
      }
      if (support.arrayBuffer) {
        var viewClasses = ['[object Int8Array]', '[object Uint8Array]', '[object Uint8ClampedArray]', '[object Int16Array]', '[object Uint16Array]', '[object Int32Array]', '[object Uint32Array]', '[object Float32Array]', '[object Float64Array]'];
        var isArrayBufferView = ArrayBuffer.isView || function (obj) {
          return obj && viewClasses.indexOf(Object.prototype.toString.call(obj)) > -1;
        };
      }
      function normalizeName(name) {
        if (typeof name !== 'string') {
          name = String(name);
        }
        if (/[^a-z0-9\-#$%&'*+.^_`|~!]/i.test(name) || name === '') {
          throw new TypeError('Invalid character in header field name: "' + name + '"');
        }
        return name.toLowerCase();
      }
      function normalizeValue(value) {
        if (typeof value !== 'string') {
          value = String(value);
        }
        return value;
      }

      // Build a destructive iterator for the value list
      function iteratorFor(items) {
        var iterator = {
          next: function () {
            var value = items.shift();
            return {
              done: value === undefined,
              value: value
            };
          }
        };
        if (support.iterable) {
          iterator[Symbol.iterator] = function () {
            return iterator;
          };
        }
        return iterator;
      }
      function Headers(headers) {
        this.map = {};
        if (headers instanceof Headers) {
          headers.forEach(function (value, name) {
            this.append(name, value);
          }, this);
        } else if (Array.isArray(headers)) {
          headers.forEach(function (header) {
            if (header.length != 2) {
              throw new TypeError('Headers constructor: expected name/value pair to be length 2, found' + header.length);
            }
            this.append(header[0], header[1]);
          }, this);
        } else if (headers) {
          Object.getOwnPropertyNames(headers).forEach(function (name) {
            this.append(name, headers[name]);
          }, this);
        }
      }
      Headers.prototype.append = function (name, value) {
        name = normalizeName(name);
        value = normalizeValue(value);
        var oldValue = this.map[name];
        this.map[name] = oldValue ? oldValue + ', ' + value : value;
      };
      Headers.prototype['delete'] = function (name) {
        delete this.map[normalizeName(name)];
      };
      Headers.prototype.get = function (name) {
        name = normalizeName(name);
        return this.has(name) ? this.map[name] : null;
      };
      Headers.prototype.has = function (name) {
        return this.map.hasOwnProperty(normalizeName(name));
      };
      Headers.prototype.set = function (name, value) {
        this.map[normalizeName(name)] = normalizeValue(value);
      };
      Headers.prototype.forEach = function (callback, thisArg) {
        for (var name in this.map) {
          if (this.map.hasOwnProperty(name)) {
            callback.call(thisArg, this.map[name], name, this);
          }
        }
      };
      Headers.prototype.keys = function () {
        var items = [];
        this.forEach(function (value, name) {
          items.push(name);
        });
        return iteratorFor(items);
      };
      Headers.prototype.values = function () {
        var items = [];
        this.forEach(function (value) {
          items.push(value);
        });
        return iteratorFor(items);
      };
      Headers.prototype.entries = function () {
        var items = [];
        this.forEach(function (value, name) {
          items.push([name, value]);
        });
        return iteratorFor(items);
      };
      if (support.iterable) {
        Headers.prototype[Symbol.iterator] = Headers.prototype.entries;
      }
      function consumed(body) {
        if (body._noBody) return;
        if (body.bodyUsed) {
          return Promise.reject(new TypeError('Already read'));
        }
        body.bodyUsed = true;
      }
      function fileReaderReady(reader) {
        return new Promise(function (resolve, reject) {
          reader.onload = function () {
            resolve(reader.result);
          };
          reader.onerror = function () {
            reject(reader.error);
          };
        });
      }
      function readBlobAsArrayBuffer(blob) {
        var reader = new FileReader();
        var promise = fileReaderReady(reader);
        reader.readAsArrayBuffer(blob);
        return promise;
      }
      function readBlobAsText(blob) {
        var reader = new FileReader();
        var promise = fileReaderReady(reader);
        var match = /charset=([A-Za-z0-9_-]+)/.exec(blob.type);
        var encoding = match ? match[1] : 'utf-8';
        reader.readAsText(blob, encoding);
        return promise;
      }
      function readArrayBufferAsText(buf) {
        var view = new Uint8Array(buf);
        var chars = new Array(view.length);
        for (var i = 0; i < view.length; i++) {
          chars[i] = String.fromCharCode(view[i]);
        }
        return chars.join('');
      }
      function bufferClone(buf) {
        if (buf.slice) {
          return buf.slice(0);
        } else {
          var view = new Uint8Array(buf.byteLength);
          view.set(new Uint8Array(buf));
          return view.buffer;
        }
      }
      function Body() {
        this.bodyUsed = false;
        this._initBody = function (body) {
          /*
            fetch-mock wraps the Response object in an ES6 Proxy to
            provide useful test harness features such as flush. However, on
            ES5 browsers without fetch or Proxy support pollyfills must be used;
            the proxy-pollyfill is unable to proxy an attribute unless it exists
            on the object before the Proxy is created. This change ensures
            Response.bodyUsed exists on the instance, while maintaining the
            semantic of setting Request.bodyUsed in the constructor before
            _initBody is called.
          */
          // eslint-disable-next-line no-self-assign
          this.bodyUsed = this.bodyUsed;
          this._bodyInit = body;
          if (!body) {
            this._noBody = true;
            this._bodyText = '';
          } else if (typeof body === 'string') {
            this._bodyText = body;
          } else if (support.blob && Blob.prototype.isPrototypeOf(body)) {
            this._bodyBlob = body;
          } else if (support.formData && FormData.prototype.isPrototypeOf(body)) {
            this._bodyFormData = body;
          } else if (support.searchParams && URLSearchParams.prototype.isPrototypeOf(body)) {
            this._bodyText = body.toString();
          } else if (support.arrayBuffer && support.blob && isDataView(body)) {
            this._bodyArrayBuffer = bufferClone(body.buffer);
            // IE 10-11 can't handle a DataView body.
            this._bodyInit = new Blob([this._bodyArrayBuffer]);
          } else if (support.arrayBuffer && (ArrayBuffer.prototype.isPrototypeOf(body) || isArrayBufferView(body))) {
            this._bodyArrayBuffer = bufferClone(body);
          } else {
            this._bodyText = body = Object.prototype.toString.call(body);
          }
          if (!this.headers.get('content-type')) {
            if (typeof body === 'string') {
              this.headers.set('content-type', 'text/plain;charset=UTF-8');
            } else if (this._bodyBlob && this._bodyBlob.type) {
              this.headers.set('content-type', this._bodyBlob.type);
            } else if (support.searchParams && URLSearchParams.prototype.isPrototypeOf(body)) {
              this.headers.set('content-type', 'application/x-www-form-urlencoded;charset=UTF-8');
            }
          }
        };
        if (support.blob) {
          this.blob = function () {
            var rejected = consumed(this);
            if (rejected) {
              return rejected;
            }
            if (this._bodyBlob) {
              return Promise.resolve(this._bodyBlob);
            } else if (this._bodyArrayBuffer) {
              return Promise.resolve(new Blob([this._bodyArrayBuffer]));
            } else if (this._bodyFormData) {
              throw new Error('could not read FormData body as blob');
            } else {
              return Promise.resolve(new Blob([this._bodyText]));
            }
          };
        }
        this.arrayBuffer = function () {
          if (this._bodyArrayBuffer) {
            var isConsumed = consumed(this);
            if (isConsumed) {
              return isConsumed;
            } else if (ArrayBuffer.isView(this._bodyArrayBuffer)) {
              return Promise.resolve(this._bodyArrayBuffer.buffer.slice(this._bodyArrayBuffer.byteOffset, this._bodyArrayBuffer.byteOffset + this._bodyArrayBuffer.byteLength));
            } else {
              return Promise.resolve(this._bodyArrayBuffer);
            }
          } else if (support.blob) {
            return this.blob().then(readBlobAsArrayBuffer);
          } else {
            throw new Error('could not read as ArrayBuffer');
          }
        };
        this.text = function () {
          var rejected = consumed(this);
          if (rejected) {
            return rejected;
          }
          if (this._bodyBlob) {
            return readBlobAsText(this._bodyBlob);
          } else if (this._bodyArrayBuffer) {
            return Promise.resolve(readArrayBufferAsText(this._bodyArrayBuffer));
          } else if (this._bodyFormData) {
            throw new Error('could not read FormData body as text');
          } else {
            return Promise.resolve(this._bodyText);
          }
        };
        if (support.formData) {
          this.formData = function () {
            return this.text().then(decode);
          };
        }
        this.json = function () {
          return this.text().then(JSON.parse);
        };
        return this;
      }

      // HTTP methods whose capitalization should be normalized
      var methods = ['CONNECT', 'DELETE', 'GET', 'HEAD', 'OPTIONS', 'PATCH', 'POST', 'PUT', 'TRACE'];
      function normalizeMethod(method) {
        var upcased = method.toUpperCase();
        return methods.indexOf(upcased) > -1 ? upcased : method;
      }
      function Request(input, options) {
        if (!(this instanceof Request)) {
          throw new TypeError('Please use the "new" operator, this DOM object constructor cannot be called as a function.');
        }
        options = options || {};
        var body = options.body;
        if (input instanceof Request) {
          if (input.bodyUsed) {
            throw new TypeError('Already read');
          }
          this.url = input.url;
          this.credentials = input.credentials;
          if (!options.headers) {
            this.headers = new Headers(input.headers);
          }
          this.method = input.method;
          this.mode = input.mode;
          this.signal = input.signal;
          if (!body && input._bodyInit != null) {
            body = input._bodyInit;
            input.bodyUsed = true;
          }
        } else {
          this.url = String(input);
        }
        this.credentials = options.credentials || this.credentials || 'same-origin';
        if (options.headers || !this.headers) {
          this.headers = new Headers(options.headers);
        }
        this.method = normalizeMethod(options.method || this.method || 'GET');
        this.mode = options.mode || this.mode || null;
        this.signal = options.signal || this.signal || function () {
          if ('AbortController' in g) {
            var ctrl = new AbortController();
            return ctrl.signal;
          }
        }();
        this.referrer = null;
        if ((this.method === 'GET' || this.method === 'HEAD') && body) {
          throw new TypeError('Body not allowed for GET or HEAD requests');
        }
        this._initBody(body);
        if (this.method === 'GET' || this.method === 'HEAD') {
          if (options.cache === 'no-store' || options.cache === 'no-cache') {
            // Search for a '_' parameter in the query string
            var reParamSearch = /([?&])_=[^&]*/;
            if (reParamSearch.test(this.url)) {
              // If it already exists then set the value with the current time
              this.url = this.url.replace(reParamSearch, '$1_=' + new Date().getTime());
            } else {
              // Otherwise add a new '_' parameter to the end with the current time
              var reQueryString = /\?/;
              this.url += (reQueryString.test(this.url) ? '&' : '?') + '_=' + new Date().getTime();
            }
          }
        }
      }
      Request.prototype.clone = function () {
        return new Request(this, {
          body: this._bodyInit
        });
      };
      function decode(body) {
        var form = new FormData();
        body.trim().split('&').forEach(function (bytes) {
          if (bytes) {
            var split = bytes.split('=');
            var name = split.shift().replace(/\+/g, ' ');
            var value = split.join('=').replace(/\+/g, ' ');
            form.append(decodeURIComponent(name), decodeURIComponent(value));
          }
        });
        return form;
      }
      function parseHeaders(rawHeaders) {
        var headers = new Headers();
        // Replace instances of \r\n and \n followed by at least one space or horizontal tab with a space
        // https://tools.ietf.org/html/rfc7230#section-3.2
        var preProcessedHeaders = rawHeaders.replace(/\r?\n[\t ]+/g, ' ');
        // Avoiding split via regex to work around a common IE11 bug with the core-js 3.6.0 regex polyfill
        // https://github.com/github/fetch/issues/748
        // https://github.com/zloirock/core-js/issues/751
        preProcessedHeaders.split('\r').map(function (header) {
          return header.indexOf('\n') === 0 ? header.substr(1, header.length) : header;
        }).forEach(function (line) {
          var parts = line.split(':');
          var key = parts.shift().trim();
          if (key) {
            var value = parts.join(':').trim();
            try {
              headers.append(key, value);
            } catch (error) {
              console.warn('Response ' + error.message);
            }
          }
        });
        return headers;
      }
      Body.call(Request.prototype);
      function Response(bodyInit, options) {
        if (!(this instanceof Response)) {
          throw new TypeError('Please use the "new" operator, this DOM object constructor cannot be called as a function.');
        }
        if (!options) {
          options = {};
        }
        this.type = 'default';
        this.status = options.status === undefined ? 200 : options.status;
        if (this.status < 200 || this.status > 599) {
          throw new RangeError("Failed to construct 'Response': The status provided (0) is outside the range [200, 599].");
        }
        this.ok = this.status >= 200 && this.status < 300;
        this.statusText = options.statusText === undefined ? '' : '' + options.statusText;
        this.headers = new Headers(options.headers);
        this.url = options.url || '';
        this._initBody(bodyInit);
      }
      Body.call(Response.prototype);
      Response.prototype.clone = function () {
        return new Response(this._bodyInit, {
          status: this.status,
          statusText: this.statusText,
          headers: new Headers(this.headers),
          url: this.url
        });
      };
      Response.error = function () {
        var response = new Response(null, {
          status: 200,
          statusText: ''
        });
        response.ok = false;
        response.status = 0;
        response.type = 'error';
        return response;
      };
      var redirectStatuses = [301, 302, 303, 307, 308];
      Response.redirect = function (url, status) {
        if (redirectStatuses.indexOf(status) === -1) {
          throw new RangeError('Invalid status code');
        }
        return new Response(null, {
          status: status,
          headers: {
            location: url
          }
        });
      };
      exports.DOMException = g.DOMException;
      try {
        new exports.DOMException();
      } catch (err) {
        exports.DOMException = function (message, name) {
          this.message = message;
          this.name = name;
          var error = Error(message);
          this.stack = error.stack;
        };
        exports.DOMException.prototype = Object.create(Error.prototype);
        exports.DOMException.prototype.constructor = exports.DOMException;
      }
      function fetch(input, init) {
        return new Promise(function (resolve, reject) {
          var request = new Request(input, init);
          if (request.signal && request.signal.aborted) {
            return reject(new exports.DOMException('Aborted', 'AbortError'));
          }
          var xhr = new XMLHttpRequest();
          function abortXhr() {
            xhr.abort();
          }
          xhr.onload = function () {
            var options = {
              statusText: xhr.statusText,
              headers: parseHeaders(xhr.getAllResponseHeaders() || '')
            };
            // This check if specifically for when a user fetches a file locally from the file system
            // Only if the status is out of a normal range
            if (request.url.indexOf('file://') === 0 && (xhr.status < 200 || xhr.status > 599)) {
              options.status = 200;
            } else {
              options.status = xhr.status;
            }
            options.url = 'responseURL' in xhr ? xhr.responseURL : options.headers.get('X-Request-URL');
            var body = 'response' in xhr ? xhr.response : xhr.responseText;
            setTimeout(function () {
              resolve(new Response(body, options));
            }, 0);
          };
          xhr.onerror = function () {
            setTimeout(function () {
              reject(new TypeError('Network request failed'));
            }, 0);
          };
          xhr.ontimeout = function () {
            setTimeout(function () {
              reject(new TypeError('Network request timed out'));
            }, 0);
          };
          xhr.onabort = function () {
            setTimeout(function () {
              reject(new exports.DOMException('Aborted', 'AbortError'));
            }, 0);
          };
          function fixUrl(url) {
            try {
              return url === '' && g.location.href ? g.location.href : url;
            } catch (e) {
              return url;
            }
          }
          xhr.open(request.method, fixUrl(request.url), true);
          if (request.credentials === 'include') {
            xhr.withCredentials = true;
          } else if (request.credentials === 'omit') {
            xhr.withCredentials = false;
          }
          if ('responseType' in xhr) {
            if (support.blob) {
              xhr.responseType = 'blob';
            } else if (support.arrayBuffer) {
              xhr.responseType = 'arraybuffer';
            }
          }
          if (init && typeof init.headers === 'object' && !(init.headers instanceof Headers || g.Headers && init.headers instanceof g.Headers)) {
            var names = [];
            Object.getOwnPropertyNames(init.headers).forEach(function (name) {
              names.push(normalizeName(name));
              xhr.setRequestHeader(name, normalizeValue(init.headers[name]));
            });
            request.headers.forEach(function (value, name) {
              if (names.indexOf(name) === -1) {
                xhr.setRequestHeader(name, value);
              }
            });
          } else {
            request.headers.forEach(function (value, name) {
              xhr.setRequestHeader(name, value);
            });
          }
          if (request.signal) {
            request.signal.addEventListener('abort', abortXhr);
            xhr.onreadystatechange = function () {
              // DONE (success or failure)
              if (xhr.readyState === 4) {
                request.signal.removeEventListener('abort', abortXhr);
              }
            };
          }
          xhr.send(typeof request._bodyInit === 'undefined' ? null : request._bodyInit);
        });
      }
      fetch.polyfill = true;
      if (!g.fetch) {
        g.fetch = fetch;
        g.Headers = Headers;
        g.Request = Request;
        g.Response = Response;
      }
      exports.Headers = Headers;
      exports.Request = Request;
      exports.Response = Response;
      exports.fetch = fetch;
      return exports;
    }({});
    if (!globalThis.fetch) {
      throw new Error('fetch is not defined - maybe your browser targets are not covering everything you need?');
    }
    var pending = 0;
    function decrement(result) {
      pending--;
      return result;
    }
    if (Ember.Test) {
      Ember.Test.registerWaiter(function () {
        return pending === 0;
      });
      exports['default'] = function () {
        pending++;
        return exports.fetch.apply(originalGlobal, arguments).then(function (response) {
          response.clone().blob().then(decrement, decrement);
          return response;
        }, function (reason) {
          decrement(reason);
          throw reason;
        });
      };
    } else {
      exports['default'] = exports.fetch;
    }
    supportProps.forEach(function (prop) {
      delete exports[prop];
    });
  });
})(typeof window !== 'undefined' && window || typeof globalThis !== 'undefined' && globalThis || typeof self !== 'undefined' && self || typeof global !== 'undefined' && global);
    }loader.makeDefaultExport=false;//# sourceMappingURL=vendor.map
