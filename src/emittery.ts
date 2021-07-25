import {
  DatalessEventNames,
  DebugOptions,
  EventName,
  ListenerAdded,
  listenerAdded,
  ListenerRemoved,
  listenerRemoved,
  OmnipresentEventData,
  Options,
  UnsubscribeFn,
} from './types';

const anyMap = new WeakMap();
const eventsMap = new WeakMap();
const producersMap = new WeakMap();
const anyProducer = Symbol('anyProducer');
const resolvedPromise = Promise.resolve();

let isGlobalDebugEnabled = false;

function assertEventName(eventName: any) {
  if (typeof eventName !== 'string' && typeof eventName !== 'symbol') {
    throw new TypeError('eventName must be a string or a symbol');
  }
}

function assertListener(listener: any) {
  if (typeof listener !== 'function') {
    throw new TypeError('listener must be a function');
  }
}

function getListeners(instance: any, eventName: any) {
  const events = eventsMap.get(instance);
  if (!events.has(eventName)) {
    events.set(eventName, new Set());
  }

  return events.get(eventName);
}

function getEventProducers(instance: any, eventName?: any) {
  const key = typeof eventName === 'string' || typeof eventName === 'symbol' ? eventName : anyProducer;
  const producers = producersMap.get(instance);
  if (!producers.has(key)) {
    producers.set(key, new Set());
  }

  return producers.get(key);
}

function enqueueProducers(instance: any, eventName: any, eventData?: any) {
  const producers = producersMap.get(instance);
  if (producers.has(eventName)) {
    for (const producer of producers.get(eventName)) {
      producer.enqueue(eventData);
    }
  }

  if (producers.has(anyProducer)) {
    const item = Promise.all([eventName, eventData]);
    for (const producer of producers.get(anyProducer)) {
      producer.enqueue(item);
    }
  }
}

function iterator<T>(instance: any, eventName?: EventName | EventName[]) {
  const eventNames = Array.isArray(eventName) ? eventName : [eventName];

  let isFinished = false;
  let flush: Function = () => {};
  let queue: any[] | undefined = [];

  const producer = {
    enqueue(item: any) {
      queue?.push(item);
      flush();
    },
    finish() {
      isFinished = true;
      flush();
    },
  };

  for (const eventName of eventNames) {
    getEventProducers(instance, eventName).add(producer);
  }

  return <AsyncIterableIterator<T>>{
    async next() {
      if (!queue) {
        return {done: true};
      }

      if (queue.length === 0) {
        if (isFinished) {
          queue = undefined;
          return this.next();
        }

        await new Promise(resolve => {
          flush = resolve;
        });

        return this.next();
      }

      return {
        done: false,
        value: await queue.shift(),
      };
    },

    async return(...args: any[]) {
      queue = undefined;

      for (const eventName of eventNames) {
        getEventProducers(instance, eventName).delete(producer);
      }

      flush();

      return args.length > 0 ? {done: true, value: await args[0]} : {done: true};
    },

    [Symbol.asyncIterator]() {
      return this;
    },
  };
}

function defaultMethodNamesOrAssert(methodNames?: readonly string[]): string[] {
  if (methodNames === undefined) {
    return allEmitteryMethods;
  }

  if (!Array.isArray(methodNames)) {
    throw new TypeError('`methodNames` must be an array of strings');
  }

  for (const methodName of methodNames) {
    if (!allEmitteryMethods.includes(methodName)) {
      throw new Error(`${methodName} is not Emittery method`);
    }
  }

  return methodNames;
}

const isListenerSymbol = (symbol: any) => symbol === listenerAdded || symbol === listenerRemoved;

export class Emittery<
  EventData = Record<string | symbol, any>, // When https://github.com/microsoft/TypeScript/issues/1863 ships, we can switch this to have an index signature including Symbols. If you want to use symbol keys right now, you need to pass an interface with those symbol keys explicitly listed.
  AllEventData = EventData & OmnipresentEventData,
  DatalessEvents = DatalessEventNames<EventData>,
> {
  /**
   Fires when an event listener was added.

   An object with `listener` and `eventName` (if `on` or `off` was used) is provided as event data.

   @example
   ```
   import Emittery = require('emittery');

   const emitter = new Emittery();

   emitter.on(Emittery.listenerAdded, ({listener, eventName}) => {
		console.log(listener);
		//=> data => {}

		console.log(eventName);
		//=> '🦄'
	});

   emitter.on('🦄', data => {
		// Handle data
	});
   ```
   */
  static readonly listenerAdded: ListenerAdded = listenerAdded;

  /**
   Fires when an event listener was removed.

   An object with `listener` and `eventName` (if `on` or `off` was used) is provided as event data.

   @example
   ```
   import Emittery = require('emittery');

   const emitter = new Emittery();

   const off = emitter.on('🦄', data => {
		// Handle data
	});

   emitter.on(Emittery.listenerRemoved, ({listener, eventName}) => {
		console.log(listener);
		//=> data => {}

		console.log(eventName);
		//=> '🦄'
	});

   off();
   ```
   */
  static readonly listenerRemoved: ListenerRemoved = listenerRemoved;

  /**
   Debugging options for the current instance.
   */
  debug: DebugOptions<EventData>;

  constructor(options: Options<EventData> = {}) {
    anyMap.set(this, new Set());
    eventsMap.set(this, new Map());
    producersMap.set(this, new Map());
    this.debug = options.debug || ({} as any);

    if (this.debug.enabled === undefined) {
      this.debug.enabled = false;
    }

    if (!this.debug.logger) {
      this.debug.logger = (type, debugName, eventName, eventData) => {
        eventData = JSON.stringify(eventData) as any;

        if (typeof eventName === 'symbol') {
          eventName = eventName.toString() as any;
        }

        const currentTime = new Date();
        const logTime = `${currentTime.getHours()}:${currentTime.getMinutes()}:${currentTime.getSeconds()}.${currentTime.getMilliseconds()}`;
        console.log(`[${logTime}][emittery:${type}][${debugName}] Event Name: ${eventName}\n\tdata: ${eventData}`);
      };
    }
  }

  /**
   Toggle debug mode for all instances.

   Default: `true` if the `DEBUG` environment variable is set to `emittery` or `*`, otherwise `false`.

   @example
   ```
   import Emittery = require('emittery');

   Emittery.isDebugEnabled = true;

   const emitter1 = new Emittery({debug: {name: 'myEmitter1'}});
   const emitter2 = new Emittery({debug: {name: 'myEmitter2'}});

   emitter1.on('test', data => {
		// …
	});

   emitter2.on('otherTest', data => {
		// …
	});

   emitter1.emit('test');
   //=> [16:43:20.417][emittery:subscribe][myEmitter1] Event Name: test
   //  data: undefined

   emitter2.emit('otherTest');
   //=> [16:43:20.417][emittery:subscribe][myEmitter2] Event Name: otherTest
   //  data: undefined
   ```
   */
  static get isDebugEnabled() {
    /* istanbul ignore if */
    if (typeof process !== 'object') {
      return isGlobalDebugEnabled;
    }

    const {env} = process ?? {env: {} as any};
    return env.DEBUG === 'emittery' || env.DEBUG === '*' || isGlobalDebugEnabled;
  }

  static set isDebugEnabled(newValue) {
    isGlobalDebugEnabled = newValue;
  }

  static mixin(
    emitteryPropertyName: string | symbol,
    methodNames?: readonly string[],
  ): <T extends {new (...args: any[]): any}>(klass: T) => T {
    methodNames = defaultMethodNamesOrAssert(methodNames);
    return (target: any) => {
      if (typeof target !== 'function') {
        throw new TypeError('`target` must be function');
      }

      for (const methodName of methodNames!) {
        if (target.prototype[methodName] !== undefined) {
          throw new Error(`The property \`${methodName}\` already exists on \`target\``);
        }
      }

      function getEmitteryProperty(this: any) {
        Object.defineProperty(this, emitteryPropertyName, {
          enumerable: false,
          value: new Emittery(),
        });
        return this[emitteryPropertyName];
      }

      Object.defineProperty(target.prototype, emitteryPropertyName, {
        enumerable: false,
        get: getEmitteryProperty,
      });

      const emitteryMethodCaller = (methodName: string) =>
        function (this: any, ...args: any[]) {
          return this[emitteryPropertyName][methodName](...args);
        };

      for (const methodName of methodNames!) {
        Object.defineProperty(target.prototype, methodName, {
          enumerable: false,
          value: emitteryMethodCaller(methodName),
        });
      }

      return target;
    };
  }

  logIfDebugEnabled(type: string, eventName: any, eventData: any) {
    if (Emittery.isDebugEnabled || this.debug.enabled) {
      this.debug.logger?.(type, this.debug.name, eventName, eventData);
    }
  }

  /**
   Subscribe to one or more events.

   Using the same listener multiple times for the same event will result in only one method call per emitted event.

   @returns An unsubscribe method.

   @example
   ```
   import Emittery = require('emittery');

   const emitter = new Emittery();

   emitter.on('🦄', data => {
		console.log(data);
	});

   emitter.on(['🦄', '🐶'], data => {
		console.log(data);
	});

   emitter.emit('🦄', '🌈'); // log => '🌈' x2
   emitter.emit('🐶', '🍖'); // log => '🍖'
   ```
   */
  on<Name extends keyof AllEventData>(
    eventName: Name | Name[],
    listener: (eventData: AllEventData[Name]) => any | Promise<any>,
  ): UnsubscribeFn {
    assertListener(listener);

    const eventNames = <any[]>(Array.isArray(eventName) ? eventName : [eventName]);
    for (const name of eventNames) {
      assertEventName(name);
      getListeners(this, name).add(listener);

      this.logIfDebugEnabled('subscribe', name, undefined);

      if (!isListenerSymbol(name)) {
        /* eslint-disable-next-line @typescript-eslint/no-floating-promises */
        this.emit(listenerAdded as any, {eventName: name, listener} as any);
      }
    }

    return () => this.off(eventNames as any, listener);
  }

  /**
   Remove one or more event subscriptions.

   @example
   ```
   import Emittery = require('emittery');

   const emitter = new Emittery();

   const listener = data => console.log(data);
   (async () => {
		emitter.on(['🦄', '🐶', '🦊'], listener);
		await emitter.emit('🦄', 'a');
		await emitter.emit('🐶', 'b');
		await emitter.emit('🦊', 'c');
		emitter.off('🦄', listener);
		emitter.off(['🐶', '🦊'], listener);
		await emitter.emit('🦄', 'a'); // nothing happens
		await emitter.emit('🐶', 'b'); // nothing happens
		await emitter.emit('🦊', 'c'); // nothing happens
	})();
   ```
   */
  off<Name extends keyof AllEventData>(
    eventName: Name | Name[],
    listener: (eventData: AllEventData[Name]) => any | Promise<any>,
  ): void {
    assertListener(listener);

    const eventNames = Array.isArray(eventName) ? eventName : [eventName];
    for (const eventName of eventNames) {
      assertEventName(eventName);
      getListeners(this, eventName).delete(listener);

      this.logIfDebugEnabled('unsubscribe', eventName, undefined);

      if (!isListenerSymbol(eventName)) {
        /* eslint-disable-next-line @typescript-eslint/no-floating-promises */
        this.emit(listenerRemoved as any, {eventName, listener} as any);
      }
    }
  }

  /**
   Subscribe to one or more events only once. It will be unsubscribed after the first
   event.

   @returns The event data when `eventName` is emitted.

   @example
   ```
   import Emittery = require('emittery');

   const emitter = new Emittery();

   emitter.once('🦄').then(data => {
		console.log(data);
		//=> '🌈'
	});

   emitter.once(['🦄', '🐶']).then(data => {
		console.log(data);
	});

   emitter.emit('🦄', '🌈'); // Logs `🌈` twice
   emitter.emit('🐶', '🍖'); // Nothing happens
   ```
   */
  once<Name extends keyof AllEventData>(eventNames: Name | Name[]): Promise<AllEventData[Name]> {
    return new Promise(resolve => {
      const off = this.on(eventNames, data => {
        off();
        resolve(data);
      });
    });
  }

  /**
   Get an async iterator which buffers data each time an event is emitted.

   Call `return()` on the iterator to remove the subscription.

   @example
   ```
   import Emittery = require('emittery');

   const emitter = new Emittery();
   const iterator = emitter.events('🦄');

   emitter.emit('🦄', '🌈1'); // Buffered
   emitter.emit('🦄', '🌈2'); // Buffered

   iterator
   .next()
   .then(({value, done}) => {
			// done === false
			// value === '🌈1'
			return iterator.next();
		})
   .then(({value, done}) => {
			// done === false
			// value === '🌈2'
			// Revoke subscription
			return iterator.return();
		})
   .then(({done}) => {
			// done === true
		});
   ```

   In practice you would usually consume the events using the [for await](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/for-await...of) statement. In that case, to revoke the subscription simply break the loop.

   @example
   ```
   import Emittery = require('emittery');

   const emitter = new Emittery();
   const iterator = emitter.events('🦄');

   emitter.emit('🦄', '🌈1'); // Buffered
   emitter.emit('🦄', '🌈2'); // Buffered

   // In an async context.
   for await (const data of iterator) {
		if (data === '🌈2') {
			break; // Revoke the subscription when we see the value `🌈2`.
		}
	}
   ```

   It accepts multiple event names.

   @example
   ```
   import Emittery = require('emittery');

   const emitter = new Emittery();
   const iterator = emitter.events(['🦄', '🦊']);

   emitter.emit('🦄', '🌈1'); // Buffered
   emitter.emit('🦊', '🌈2'); // Buffered

   iterator
   .next()
   .then(({value, done}) => {
			// done === false
			// value === '🌈1'
			return iterator.next();
		})
   .then(({value, done}) => {
			// done === false
			// value === '🌈2'
			// Revoke subscription
			return iterator.return();
		})
   .then(({done}) => {
			// done === true
		});
   ```
   */
  events<Name extends keyof EventData>(eventName: Name | Name[]): AsyncIterableIterator<EventData[Name]> {
    const eventNames: any[] = Array.isArray(eventName) ? eventName : [eventName];
    for (const eventName of eventNames) {
      assertEventName(eventName);
    }

    return iterator<EventData[Name]>(this, eventNames);
  }

  /**
   Trigger an event asynchronously, optionally with some data. Listeners are called in the order they were added, but executed concurrently.

   @returns A promise that resolves when all the event listeners are done. *Done* meaning executed if synchronous or resolved when an async/promise-returning function. You usually wouldn't want to wait for this, but you could for example catch possible errors. If any of the listeners throw/reject, the returned promise will be rejected with the error, but the other listeners will not be affected.
   */
  async emit<Name extends DatalessEvents>(eventName: Name): Promise<void>;
  async emit<Name extends keyof EventData>(eventName: Name, eventData: EventData[Name]): Promise<void>;
  async emit<Name extends keyof EventData>(eventName: Name, eventData?: EventData[Name]): Promise<void> {
    assertEventName(eventName);

    this.logIfDebugEnabled('emit', eventName, eventData);

    enqueueProducers(this, eventName, eventData);

    const listeners = getListeners(this, eventName);
    const anyListeners = anyMap.get(this);
    const staticListeners = [...listeners];
    const staticAnyListeners = isListenerSymbol(eventName) ? [] : [...anyListeners];

    await resolvedPromise;
    await Promise.all([
      ...staticListeners.map(async listener => {
        if (listeners.has(listener)) {
          return listener(eventData);
        }
      }),
      ...staticAnyListeners.map(async listener => {
        if (anyListeners.has(listener)) {
          return listener(eventName, eventData);
        }
      }),
    ]);
  }

  /**
   Same as `emit()`, but it waits for each listener to resolve before triggering the next one. This can be useful if your events depend on each other. Although ideally they should not. Prefer `emit()` whenever possible.

   If any of the listeners throw/reject, the returned promise will be rejected with the error and the remaining listeners will *not* be called.

   @returns A promise that resolves when all the event listeners are done.
   */
  async emitSerial<Name extends DatalessEvents>(eventName: Name): Promise<void>;
  async emitSerial<Name extends keyof EventData>(eventName: Name, eventData: EventData[Name]): Promise<void>;
  async emitSerial<Name extends keyof EventData>(eventName: Name, eventData?: EventData[Name]): Promise<void> {
    assertEventName(eventName);

    this.logIfDebugEnabled('emitSerial', eventName, eventData);

    const listeners = getListeners(this, eventName);
    const anyListeners = anyMap.get(this);
    const staticListeners = [...listeners];
    const staticAnyListeners = [...anyListeners];

    await resolvedPromise;
    for (const listener of staticListeners) {
      if (listeners.has(listener)) {
        await listener(eventData);
      }
    }

    for (const listener of staticAnyListeners) {
      if (anyListeners.has(listener)) {
        await listener(eventName, eventData);
      }
    }
    /* eslint-enable no-await-in-loop */
  }

  /**
   Subscribe to be notified about any event.

   @returns A method to unsubscribe.
   */
  onAny(
    listener: (eventName: keyof EventData, eventData?: EventData[keyof EventData]) => any | Promise<any>,
  ): UnsubscribeFn {
    assertListener(listener);

    this.logIfDebugEnabled('subscribeAny', undefined, undefined);

    anyMap.get(this).add(listener);
    /* eslint-disable-next-line @typescript-eslint/no-floating-promises */
    this.emit(listenerAdded as any, {listener} as any);
    return this.offAny.bind(this, listener);
  }

  /**
   Get an async iterator which buffers a tuple of an event name and data each time an event is emitted.

   Call `return()` on the iterator to remove the subscription.

   In the same way as for `events`, you can subscribe by using the `for await` statement.

   @example
   ```
   import Emittery = require('emittery');

   const emitter = new Emittery();
   const iterator = emitter.anyEvent();

   emitter.emit('🦄', '🌈1'); // Buffered
   emitter.emit('🌟', '🌈2'); // Buffered

   iterator.next()
   .then(({value, done}) => {
			// done is false
			// value is ['🦄', '🌈1']
			return iterator.next();
		})
   .then(({value, done}) => {
			// done is false
			// value is ['🌟', '🌈2']
			// revoke subscription
			return iterator.return();
		})
   .then(({done}) => {
			// done is true
		});
   ```
   */
  anyEvent(): AsyncIterableIterator<[keyof EventData, EventData[keyof EventData]]> {
    return iterator(this);
  }

  /**
   Remove an `onAny` subscription.
   */
  offAny(listener: (eventName: keyof EventData, eventData: EventData[keyof EventData]) => any | Promise<any>): void {
    assertListener(listener);

    this.logIfDebugEnabled('unsubscribeAny', undefined, undefined);
    /* eslint-disable-next-line @typescript-eslint/no-floating-promises */
    this.emit(listenerRemoved as any, {listener} as any);
    anyMap.get(this).delete(listener);
  }

  /**
   Clear all event listeners on the instance.

   If `eventName` is given, only the listeners for that event are cleared.
   */
  clearListeners<Name extends keyof EventData>(eventName?: Name | Name[]): void {
    const eventNames = Array.isArray(eventName) ? eventName : [eventName];

    for (const eventName of eventNames) {
      this.logIfDebugEnabled('clear', eventName, undefined);

      if (typeof eventName === 'string' || typeof eventName === 'symbol') {
        getListeners(this, eventName).clear();

        const producers = getEventProducers(this, eventName);

        for (const producer of producers) {
          producer.finish();
        }

        producers.clear();
      } else {
        anyMap.get(this).clear();

        for (const listeners of eventsMap.get(this).values()) {
          listeners.clear();
        }

        for (const producers of producersMap.get(this).values()) {
          for (const producer of producers) {
            producer.finish();
          }

          producers.clear();
        }
      }
    }
  }

  /**
   The number of listeners for the `eventName` or all events if not specified.
   */
  listenerCount<Name extends keyof EventData>(eventName?: Name | Name[]): number {
    const eventNames = Array.isArray(eventName) ? eventName : [eventName];
    let count = 0;

    for (const eventName of eventNames) {
      if (typeof eventName === 'string') {
        count +=
          anyMap.get(this).size +
          getListeners(this, eventName).size +
          getEventProducers(this, eventName).size +
          getEventProducers(this).size;
        continue;
      }

      if (typeof eventName !== 'undefined') {
        assertEventName(eventName);
      }

      count += anyMap.get(this).size;

      for (const value of eventsMap.get(this).values()) {
        count += value.size;
      }

      for (const value of producersMap.get(this).values()) {
        count += value.size;
      }
    }

    return count;
  }

  /**
   Bind the given `methodNames`, or all `Emittery` methods if `methodNames` is not defined, into the `target` object.

   @example
   ```
   import Emittery = require('emittery');

   const object = {};

   new Emittery().bindMethods(object);

   object.emit('event');
   ```
   */
  bindMethods(target: Record<string, unknown>, methodNames?: readonly string[]): void {
    if (typeof target !== 'object' || target === null) {
      throw new TypeError('`target` must be an object');
    }

    methodNames = defaultMethodNamesOrAssert(methodNames);

    for (const methodName of methodNames) {
      if (target[methodName] !== undefined) {
        throw new Error(`The property \`${methodName}\` already exists on \`target\``);
      }

      Object.defineProperty(target, methodName, {
        enumerable: false,
        value: (this as any)[methodName].bind(this),
      });
    }
  }
}

const allEmitteryMethods = Object.getOwnPropertyNames(Emittery.prototype).filter(v => v !== 'constructor');
