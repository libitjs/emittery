/**
 Emittery accepts strings and symbols as event names.

 Symbol event names can be used to avoid name collisions when your classes are extended, especially for internal events.
 */
export type EventName = string | symbol;

// Helper type for turning the passed `EventData` type map into a list of string keys that don't require data alongside the event name when emitting. Uses the same trick that `Omit` does internally to filter keys by building a map of keys to keys we want to keep, and then accessing all the keys to return just the list of keys we want to keep.
export type DatalessEventNames<EventData> = {
  [Key in keyof EventData]: EventData[Key] extends undefined ? Key : never;
}[keyof EventData];

/**
 Removes an event subscription.
 */
export type UnsubscribeFn = () => void;

/**
 The data provided as `eventData` when listening for `Emittery.listenerAdded` or `Emittery.listenerRemoved`.
 */
export interface ListenerChangedData {
  /**
   The listener that was added or removed.
   */
  listener: (eventData?: unknown) => void | Promise<void>;

  /**
   The name of the event that was added or removed if `.on()` or `.off()` was used, or `undefined` if `.onAny()` or `.offAny()` was used.
   */
  eventName?: EventName;
}

export const listenerAdded = Symbol('listenerAdded');
export const listenerRemoved = Symbol('listenerRemoved');

export type ListenerAdded = typeof listenerAdded;
export type ListenerRemoved = typeof listenerRemoved;

export type OmnipresentEventData = {[listenerAdded]: ListenerChangedData; [listenerRemoved]: ListenerChangedData};

/**
 Emittery can collect and log debug information.

 To enable this feature set the `DEBUG` environment variable to `emittery` or `*`. Additionally, you can set the static `isDebugEnabled` variable to true on the Emittery class, or `myEmitter.debug.enabled` on an instance of it for debugging a single instance.

 See API for more information on how debugging works.
 */
type DebugLogger<EventData, Name extends keyof EventData> = (
  type: string,
  debugName: string,
  eventName?: Name,
  eventData?: EventData[Name],
) => void;

/**
 Configure debug options of an instance.
 */
export interface DebugOptions<EventData> {
  /**
   Define a name for the instance of Emittery to use when outputting debug data.

   @default undefined

   @example
   ```
   import Emittery = require('emittery');

   Emittery.isDebugEnabled = true;

   const emitter = new Emittery({debug: {name: 'myEmitter'}});

   emitter.on('test', data => {
		// …
	});

   emitter.emit('test');
   //=> [16:43:20.417][emittery:subscribe][myEmitter] Event Name: test
   //	data: undefined
   ```
   */
  readonly name: string;

  /**
   Toggle debug logging just for this instance.

   @default false

   @example
   ```
   import Emittery = require('emittery');

   const emitter1 = new Emittery({debug: {name: 'emitter1', enabled: true}});
   const emitter2 = new Emittery({debug: {name: 'emitter2'}});

   emitter1.on('test', data => {
		// …
	});

   emitter2.on('test', data => {
		// …
	});

   emitter1.emit('test');
   //=> [16:43:20.417][emittery:subscribe][emitter1] Event Name: test
   //	data: undefined

   emitter2.emit('test');
   ```
   */
  enabled?: boolean;

  /**
   Function that handles debug data.

   @default
   ```
   (type, debugName, eventName, eventData) => {
		eventData = JSON.stringify(eventData);

		if (typeof eventName === 'symbol') {
			eventName = eventName.toString();
		}

		const currentTime = new Date();
		const logTime = `${currentTime.getHours()}:${currentTime.getMinutes()}:${currentTime.getSeconds()}.${currentTime.getMilliseconds()}`;
		console.log(`[${logTime}][emittery:${type}][${debugName}] Event Name: ${eventName}\n\tdata: ${eventData}`);
	}
   ```

   @example
   ```
   import Emittery = require('emittery');

   const myLogger = (type, debugName, eventName, eventData) => console.log(`[${type}]: ${eventName}`);

   const emitter = new Emittery({
		debug: {
			name: 'myEmitter',
			enabled: true,
			logger: myLogger
		}
	});

   emitter.on('test', data => {
		// …
	});

   emitter.emit('test');
   //=> [subscribe]: test
   ```
   */
  logger?: DebugLogger<EventData, keyof EventData>;
}

/**
 Configuration options for Emittery.
 */
export interface Options<EventData> {
  debug?: DebugOptions<EventData>;
}

export const noop = () => {};
