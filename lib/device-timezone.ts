"use client";
import { useSyncExternalStore } from "react";
import { DEFAULT_TIMEZONE } from "./types.ts";

function currentTimezone() {
  try {
    const value = localStorage.getItem("skedy.timezone") || DEFAULT_TIMEZONE;
    new Intl.DateTimeFormat("en", { timeZone: value });
    return value;
  } catch { return DEFAULT_TIMEZONE; }
}
function subscribe(listener: () => void) {
  window.addEventListener("storage", listener);
  window.addEventListener("skedy:timezone", listener);
  return () => { window.removeEventListener("storage", listener); window.removeEventListener("skedy:timezone", listener); };
}
export function useDeviceTimezone() {
  return useSyncExternalStore(subscribe, currentTimezone, () => DEFAULT_TIMEZONE);
}
export function saveDeviceTimezone(value: string) {
  try { localStorage.setItem("skedy.timezone", value); window.dispatchEvent(new Event("skedy:timezone")); } catch { /* A restricted browser keeps the default timezone. */ }
}
