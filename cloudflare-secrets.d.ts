export {};

declare global {
  interface CloudflareEnv extends Omit<CloudflareBindings, "PANDASCORE_TOKEN"> {
    PANDASCORE_TOKEN?: string;
  }
}
