import {z} from 'zod';
const documentation=z.string().max(40000).default('').refine(s=>!/\b(?:password|pwd|access[_ -]?token|secret)\s*[:=]\s*["']?[^\s<]/i.test(s)&&!/:\/\/[^\s/@:]+:[^\s/@]+@/.test(s),'Keep credentials in the protected server environment; source details must not contain secret values.');
export const sourceDetailsShape={profileVersion:z.string().max(100).default(''),connectionDetails:documentation,extractionMethod:documentation,reviewNotes:documentation};
export const sourceDetailsInput=z.object(sourceDetailsShape).strict();
