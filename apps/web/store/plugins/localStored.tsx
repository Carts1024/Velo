"use client";

import { ExtensionFactory, hookstate, State } from "@hookstate/core";

export interface StoreEngine {
  getItem: (key: string) => Promise<string | null> | string;
  setItem: (key: string, value: string) => Promise<void> | void;
  removeItem: (key: string) => Promise<void> | void;
}

// Plugin marker interface for type safety
export interface LocalStored {
  readonly _type?: "localStored";
}

// Define interface for extension methods
// Using any here is acceptable as it's an internal interface for the plugin

interface ExtensionMethods {
  // oxlint-disable-next-line @typescript-eslint/no-explicit-any
  identifier?: (state: State<any, any>) => string;
  // oxlint-disable-next-line @typescript-eslint/no-explicit-any
  serialize?: (s: State<any, any>) => () => string;

  deserialize?: (
    // oxlint-disable-next-line @typescript-eslint/no-explicit-any
    state: State<any, any>,
    // oxlint-disable-next-line @typescript-eslint/no-explicit-any
  ) => (s: State<any, any>) => (v: string) => void;
}

export function localstored<S, E>(options?: {
  key?: string;
  engine?: StoreEngine;
  initializer?: () => Promise<S>;
  // oxlint-disable-next-line @typescript-eslint/no-explicit-any
  onRestored?: (s: any) => void;
}): ExtensionFactory<S, E, LocalStored> {
  return () => {
    let key: string;
    let serializer: (s: State<S, E & LocalStored>) => () => string;
    let deserializer: (s: State<S, E & LocalStored>) => (v: string) => void;
    let stateAtRoot: State<S, E & LocalStored>;
    let storageEngine: StoreEngine | Storage;

    // Check if the code is running in a browser environment
    if (typeof window !== "undefined") {
      // Use the specified storage engine or fallback to window.localStorage
      storageEngine = options?.engine || window.localStorage;
    } else {
      // Replace with your desired behavior for non-browser environments
      // Create a dummy storage engine for server-side rendering
      storageEngine = options?.engine || {
        // oxlint-disable-next-line @typescript-eslint/no-unused-vars
        getItem: (_key: string) => Promise.resolve(null),
        // oxlint-disable-next-line @typescript-eslint/no-unused-vars
        setItem: (_key: string, _value: string) => Promise.resolve(),
        // oxlint-disable-next-line @typescript-eslint/no-unused-vars
        removeItem: (_key: string) => Promise.resolve(),
      };
    }

    return {
      onInit: (state, extensionMethods: ExtensionMethods) => {
        stateAtRoot = state;
        if (options?.key === undefined) {
          if (extensionMethods.identifier === undefined) {
            throw Error("State is missing Identifiable extension");
          }
          key = extensionMethods.identifier(state);
        } else {
          key = options.key;
        }
        if (extensionMethods.serialize !== undefined) {
          serializer = extensionMethods.serialize;
        } else {
          serializer = (s) => () => JSON.stringify(s.get({ noproxy: true }));
        }
        if (extensionMethods.deserialize !== undefined) {
          deserializer = extensionMethods.deserialize(state);
        } else {
          deserializer = (s) => (v) => s.set(JSON.parse(v));
        }

        // here it is synchronous, but most storages would be async
        // this is supported too, as the state.set can be really set asynchronously
        const response = storageEngine.getItem(key);
        Promise.resolve(response).then((persisted) => {
          if (persisted) {
            // persisted state exists
            deserializer(state)(persisted); // this one sets the state value as well
          } else if (options?.initializer) {
            options.initializer().then((s) => {
              state.set(s);
            });
          }

          if (options?.onRestored) {
            options.onRestored(persisted ? state : hookstate(null));
          }
        });
      },
      onSet: (s) => {
        if (s.promised || s.error !== undefined) {
          const response = storageEngine.removeItem(key);
          Promise.resolve(response).then(() => {});
        } else {
          // save the entire state from the root
          // smarter implementations could implement partial state saving,
          // which would save only the nested state set (parameter `s` in onSet)
          const response = storageEngine.setItem(key, serializer(stateAtRoot)());
          Promise.resolve(response).then(() => {});
        }
      },
    };
  };
}
