import { readFileSync, writeFileSync, mkdirSync, lstatSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { stripTypeScriptTypes } from 'node:module'
const repo='/Users/taylor/src/github/kickoff'
const output=process.env.HOME.replace(/\/home$/, '') + (process.env.HOME.endsWith('/home') ? '/fixture-context' : '/.zdr-harness/fixture-context')
mkdirSync(output,{recursive:true,mode:0o700})
if(lstatSync(output).isSymbolicLink() || (lstatSync(output).mode & 0o077))throw Error('Private reference directory required')
const files={contract:'/Users/taylor/Desktop/call_guidance/fixtures/data-loader/export-contract.md',source_shape:'/Users/taylor/Desktop/call_guidance/fixtures/data-loader/source-shape.json',schema:repo+'/node/schema.graphql',call_number_source:repo+'/node/lib/call-number/compute.ts',call_number_loader:repo+'/node/lib/call-number/index.ts'}
files.meal_day=repo+'/node/utilities/logged-meal/meal-day.ts'
files.macro_merge=repo+'/node/utilities/logged-meal/get-merged-macros-for-meal.ts'
for(const name of ['window','meals','wearables','workouts','plan','types'])files['facts_'+name]=repo+'/node/lib/call-briefing-facts/'+name+'.ts'
const pins={}
for(const [name,path] of Object.entries(files)){const bytes=readFileSync(path);writeFileSync(output+'/'+name+'.txt',bytes,{mode:0o600});pins[name]={sha256:createHash('sha256').update(bytes).digest('hex'),sourcePath:path,bytes:bytes.length}}
writeFileSync(output+'/pins.json',JSON.stringify(pins,null,2)+'\n',{mode:0o600})
const source=readFileSync(files.call_number_source,'utf8')
const loader=readFileSync(files.call_number_loader,'utf8')
const start=loader.indexOf('export const targetForCall =')
const end=loader.indexOf('\n/**',start)
const shim=`const D = { isAfter: (a,b) => +new Date(a) > +new Date(b), isBefore: (a,b) => +new Date(a) < +new Date(b), addMinutes: (d,n) => new Date(+new Date(d) + n*60000), subMinutes: (d,n) => new Date(+new Date(d) - n*60000) }\n`
const generated=stripTypeScriptTypes(source.replace("import * as D from 'date-fns'",shim)+'\n'+loader.slice(start,end).replace('call: CallLike','call: any'),{mode:'strip'})
writeFileSync(output+'/fixture-call-number.generated.mjs','// Generated from pinned Kickoff compute.ts + targetForCall; do not edit.\n// Date shim implements only the four date-fns operations used here, in milliseconds.\n'+generated,{mode:0o600})

const meal=readFileSync(files.meal_day,'utf8'),window=readFileSync(files.facts_window,'utf8'),wearables=readFileSync(files.facts_wearables,'utf8'),macros=readFileSync(files.macro_merge,'utf8')
const mealPure=meal.slice(meal.indexOf('export const mealDateString'),meal.indexOf('const shiftDay'))+meal.slice(meal.indexOf('export const getMealDay'),meal.indexOf('// Retain'))
const dayPure=window.slice(window.indexOf('export const daysBetween'),window.indexOf('/**',window.indexOf('export const daysBetween')))
const terraPure=wearables.slice(wearables.indexOf('const LOCAL_DATE'),wearables.indexOf('/** Per day'))
const macroPure=macros.slice(macros.indexOf('const hasAllRequiredData'),macros.indexOf('const getMergedMacrosForLoggedMeal'))
const ramdaShim=`const R={pick:(keys,obj)=>Object.fromEntries(keys.filter(k=>Object.hasOwn(obj,k)).map(k=>[k,obj[k]])),values:Object.values,all:(fn,arr)=>arr.every(fn),isNil:x=>x==null,groupBy:(fn,arr)=>arr.reduce((groups,x)=>{(groups[fn(x)]??=[]).push(x);return groups},{})}\n`
writeFileSync(output+'/fixture-facts.generated.mjs','// Generated from pinned meal-day, window, wearable day and macro merge source.\n'+stripTypeScriptTypes(mealPure+dayPure+terraPure+ramdaShim+macroPure,{mode:'strip'}),{mode:0o600})

const generatedPins=Object.fromEntries(['fixture-call-number.generated.mjs','fixture-facts.generated.mjs'].map(name=>[name,createHash('sha256').update(readFileSync(output+'/'+name)).digest('hex')]))
writeFileSync(output+'/generated-pins.json',JSON.stringify(generatedPins,null,2)+'\n',{mode:0o600})
