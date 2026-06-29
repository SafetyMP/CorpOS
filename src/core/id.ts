import { customAlphabet, nanoid } from "nanoid";

const short = customAlphabet("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz", 16);

export const newId = (prefix = ""): string => (prefix ? `${prefix}_${short()}` : nanoid());
