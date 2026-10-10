import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {readFile} from 'node:fs/promises';
import {homedir} from 'node:os';
import {fileURLToPath} from 'node:url';
const exec=promisify(execFile);
const bundle=fileURLToPath(new URL('../../../data/record-screen/widget/Record Screen Control.app',import.meta.url));
const group='H77CX8PYPV.com.taylor.record-screen.widget';
const instructions='Right-click empty desktop wallpaper → Edit Widgets → search Screen recording (app: Record Screen Control) → add the single Medium preview. The service gate is authoritative; macOS schedules widget refreshes. Open the live panel for current status.';

export async function widgetStatus(){
 const result={schema:'record-screen-widget-status/v1',installed:false,helper_running:null,configured_widget_count:null,desktop_placement:'not_observable_from_configuration_count',snapshot:null,instructions};
 let info;
 try{info=JSON.parse((await exec('/usr/bin/plutil',['-convert','json','-o','-',bundle+'/Contents/Info.plist'],{timeout:3000})).stdout)}catch{return result}
 if(info.CFBundleIdentifier!=='com.taylor.record-screen.control')return result;
 result.installed=true;result.bundle=bundle;result.widget_build=info.RSWidgetBuild;
 try{
  // launchctl's environment may contain secrets. Never expose raw output,
  // stderr or error objects; extract only the exact helper state and PID.
  const {stdout}=await exec('/bin/launchctl',['print',`gui/${process.getuid()}/com.taylor.record-screen.widget-host`],{timeout:3000,maxBuffer:512*1024});
  result.helper_running=/^\s*state = running\s*$/m.test(stdout);
  const pid=stdout.match(/^\s*pid = (\d+)\s*$/m);if(pid)result.helper_pid=Number(pid[1]);
 }catch{result.helper_running=null}
 try{
  const {stdout}=await exec(bundle+'/Contents/MacOS/record-screen-control',['--configurations'],{timeout:5000,maxBuffer:8192});
  const count=JSON.parse(stdout).configured_widgets;
  if(Number.isSafeInteger(count)&&count>=0)result.configured_widget_count=count;
 }catch{/* Unavailable configuration is unknown, never zero. */}
 try{
  const raw=await readFile(homedir()+'/Library/Group Containers/'+group+'/production.json','utf8');
  if(raw.length>16384)throw Error('bounded snapshot');
  const s=JSON.parse(raw);const time=(s.sampledAt+978307200)*1000;
  if(!Number.isFinite(time)||![s.active,s.queued,s.actions].every(n=>Number.isSafeInteger(n)&&n>=0)||typeof s.paused!=='boolean'||!['idle','recording','draining','paused','unavailable'].includes(s.phase))throw Error('invalid snapshot');
  result.snapshot={sampled_at:new Date(time).toISOString(),age_ms:Date.now()-time,phase:s.phase,active:s.active,queued:s.queued,actions:s.actions,pause_requested:s.paused};
  result.snapshot.stale=result.snapshot.age_ms>30000||result.snapshot.age_ms< -5000||s.phase==='unavailable';
 }catch{/* Failed/missing shared snapshot is unknown. */}
 return result;
}
