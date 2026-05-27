"use client";

import { extend, hookstate, useHookstate } from "@hookstate/core";
import { devtools } from "@hookstate/devtools";
import merge from "lodash.merge";

import { localstored } from "./plugins/localStored";

const initialState = {
  sample: {
    counter: 0,
  },
};

export const globalStatePersist = hookstate(
  initialState,
  extend(
    localstored({
      key: "globalStatePersist",
      onRestored: (s) => {
        // Only proceed if we have a valid state object and we're in the browser
        if (s && typeof s.get === "function" && typeof window !== "undefined") {
          const restored = s.get({ noproxy: true });
          const synced = merge({}, initialState, restored);
          console.log("restored state: ", synced);
          s.set(synced);
        }
      },
    }),
    devtools({ key: "globalStatePersist" }),
  ),
);

export const useGlobalStatePersist = () => useHookstate(globalStatePersist);
