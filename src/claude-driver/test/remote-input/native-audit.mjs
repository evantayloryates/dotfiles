import {execFileSync} from 'node:child_process'
import {readFileSync,existsSync} from 'node:fs'
import {join} from 'node:path'
export function audit(workspace){
    const env={HOME:'/Users/theo',PATH:'/usr/bin:/bin:/usr/sbin:/sbin',TMPDIR:join(workspace,'tmp')}
    const taps=JSON.parse(execFileSync('/usr/bin/swift',[join(workspace,'tools/input-taps.swift')],{env,timeout:20000,encoding:'utf8'}))
    const rows=execFileSync('/bin/ps',['-axo','pid=,ppid=,comm='],{env,timeout:5000,encoding:'utf8'}).trim().split('\n')
    const helperPath=join(workspace,'codex-home/computer-use/Codex Computer Use.app/Contents/MacOS/SkyComputerUseService')
    const processes=rows.flatMap(line=>{const m=line.trim().match(/^(\d+)\s+(\d+)\s+(.+)$/);return m?[{pid:Number(m[1]),ppid:Number(m[2]),path:m[3]}]:[]})
    const helperProcesses=processes.filter(p=>p.path===helperPath)
    const helperPids=new Set(helperProcesses.map(p=>p.pid))
    const statePath=join(workspace,'fixture/state.json')
    const fixtureState=existsSync(statePath)?JSON.parse(readFileSync(statePath,'utf8')):null
    const fixtureProcessCurrent=processes.some(p=>p.pid===fixtureState?.pid&&p.path===join(workspace,'fixture/ClaudeDriverInputFixture.app/Contents/MacOS/InputFixture'))
    return {at:new Date().toISOString(),taps,helperProcesses,fixtureState,fixtureProcessCurrent,
        helperKeyboardFilters:taps.filter(t=>helperPids.has(t.ownerPid)&&t.enabled&&t.options===0&&(BigInt(t.mask)&7168n)!==0n)}
}
