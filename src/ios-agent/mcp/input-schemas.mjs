import {z} from 'zod';
const empty=z.object({}).strict();
const ref=z.string().min(1).max(128);
const coordinate=z.number().finite().nonnegative();
const point={snapshot:ref.describe('Exact snapshot from the latest native tree; expires after five seconds.'),target:ref.describe('Exact target from that tree, never inferred from list order.'),x:coordinate,y:coordinate};
export const nativeSelector=z.union([
 z.object({label:ref,identifier:ref.optional(),class:ref.optional()}).strict(),
 z.object({identifier:ref,label:ref.optional(),class:ref.optional()}).strict(),
 z.object({class:ref,label:ref.optional(),identifier:ref.optional()}).strict(),
]);
export const nativeSchemas={
 capabilities:empty,tree:empty,state:empty,'diagnostics-probe':empty,'diagnostics-matrix':empty,reload:empty,home:empty,
 image:z.object({scale:z.union([z.literal(1),z.literal(2),z.literal(3)]).optional()}).strict(),
 tap:z.union([z.object(point).strict(),z.object({selector:nativeSelector}).strict()]),
 gesture:z.object({...point,endX:coordinate,endY:coordinate,durationMs:z.number().finite().min(50).max(5000)}).strict(),
 text:z.object({text:z.string().max(4096).describe('Semantic UIKeyInput text; empty string is allowed for replacement.'),mode:z.enum(['insert','replace']).optional()}).strict(),
 wifi:z.object({state:z.enum(['on','off'])}).strict(),
};
export const nativeArguments=z.union(Object.entries(nativeSchemas).map(([action,schema])=>schema.describe(`Arguments for ${action}`))).default({});
const component=z.union([z.number().int().nonnegative(),z.string().min(1).max(300)]).describe('Observed React component ID or exact provider label; not a native target.');
const limit=z.number().int().min(1).max(1000).optional();
const command=(type,fields={})=>z.object({type:z.literal(type),...fields}).strict();
export const reactCommand=z.discriminatedUnion('type',[
 ...['ping','status','count','errors','profile-stop','profile-export'].map(type=>command(type)),
 command('get-tree',{depth:z.number().int().min(0).max(100).optional(),noHost:z.boolean().optional(),root:component.optional()}),
 command('get-component',{id:component}),
 command('find',{name:z.string().min(1).max(300),exact:z.boolean().optional()}),
 command('profile-start',{name:z.string().min(1).max(300).optional()}),
 command('profile-report',{componentId:component}),
 command('profile-slow',{limit}),command('profile-rerenders',{limit}),
 command('profile-timeline',{limit,offset:z.number().int().nonnegative().optional(),sort:z.enum(['duration','time']).optional()}),
 command('profile-commit',{index:z.number().int().nonnegative(),limit}),
]);
