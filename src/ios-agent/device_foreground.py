"""Short-lived Apple app-state evidence, independent of XCTest and page JS."""
import asyncio
import time
try:
    from signals import emit_signal
except ImportError:
    emit_signal = None

def _signal(event, **fields):
    try:
        if emit_signal:emit_signal('host', event, **fields)
    except Exception:pass

SERVICE='com.apple.accessibility.axAuditDaemon.remoteserver.shim.remote'
BUNDLES={'com.dev.kudos.fit','com.apple.Preferences','com.apple.mobilesafari','com.google.chrome.ios'}

async def launch_observed(r,rsd,bundle,dispatch,check):
    """Dispatch exactly once; report a bounded foreground event, never readiness.

    Observer absence does not substitute USB/XCTest or replay a launch. A failed
    cleanup after monitoring starts fails closed and preserves dispatch metadata.
    No element focus, activation, accessibility setting or visual overlay call.
    """
    if bundle not in BUNDLES:raise ValueError('fixed_foreground_target_required')
    check()
    if SERVICE not in (getattr(rsd,'peer_info',None) or {}).get('Services',{}):
        value=await dispatch()
        _signal('foreground.observation', outcome='unavailable', reason='app_state_service_unavailable')
        return value,{'foregroundVerified':False,'foregroundReason':'app_state_service_unavailable'}
    from pymobiledevice3.services.accessibilityaudit import AccessibilityAudit
    audit=AccessibilityAudit(rsd);entered=False;monitoring=False;task=None;last=None;ready=asyncio.Event()
    armed=False
    async def collect():
        nonlocal last
        async for event in audit.iter_events(app_monitoring_enabled=True):
            check()
            if not armed or event.name!='hostAppStateChanged:' or not isinstance(event.data,dict):continue
            d=event.data
            if d.get('displayID')!=bundle:continue
            state=d.get('state')
            if type(state) is not int:continue
            last={'state':state,'observedAt':time.time(),'monotonic':time.monotonic()}
            if state==8:ready.set()
            else:ready.clear()
    try:
        try:
            r['_phase']='foreground_monitor_connect'
            await asyncio.wait_for(audit.__aenter__(),3);entered=True
        except Exception:
            if monitoring:raise
            # No monitoring admitted. The paired fixed launch still works when
            # an older iOS version lacks this optional observation channel.
            await asyncio.wait_for(audit.close(),2)
            _signal('foreground.observation', outcome='unavailable', reason='app_state_observer_unavailable')
            return await dispatch(),{'foregroundVerified':False,'foregroundReason':'app_state_observer_unavailable'}
        check();r['_phase']='foreground_monitor_start';monitoring=True
        await asyncio.wait_for(audit.set_app_monitoring_enabled(True),2)
        await asyncio.wait_for(audit.set_monitored_event_type(),2)
        task=asyncio.create_task(collect());await asyncio.sleep(0)
        check();armed=True
        value=await dispatch()
        try:await asyncio.wait_for(ready.wait(),2)
        except TimeoutError:pass
        # Let a closely following background transition retire the evidence.
        await asyncio.sleep(.1);check()
        if task.done() and not task.cancelled():task.result()
        matched=last is not None and last['state']==8
        evidence={'foregroundVerified':matched,'foregroundReason':'observed_foreground_event' if matched else 'no_current_foreground_event',
            'foregroundScope':'bounded Apple app-state event; not native/React/page readiness'}
        if matched:evidence['foregroundEvidence']={'provider':'Apple-AX-app-state','bundle':bundle,'state':8,
            'observedAt':last['observedAt'],'ageMs':round((time.monotonic()-last['monotonic'])*1000)}
        _signal('foreground.observation', outcome='verified' if matched else 'unconfirmed',
                reason=evidence['foregroundReason'])
        return value,evidence
    except BaseException:
        # Cleanup must not relabel a launch/connect failure as a cleanup-stage
        # failure. The outer observer reports the original dispatch phase.
        r['_failurePhase']=r.get('_phase','foreground_observation')
        raise
    finally:
        if task:
            task.cancel();await asyncio.gather(task,return_exceptions=True)
        if monitoring:r['_phase']='foreground_monitor_cleanup'
        cleanup_errors=[]
        if monitoring:
            for operation in (lambda:audit.set_app_monitoring_enabled(False),lambda:audit._invoke('devicePerformFinalCleanup',expects_reply=False)):
                try:await asyncio.wait_for(operation(),2)
                except Exception as error:cleanup_errors.append(error)
        if entered:
            try:await asyncio.wait_for(audit.close(),2)
            except Exception as error:cleanup_errors.append(error)
        if cleanup_errors:
            _signal('foreground.cleanup', outcome='unconfirmed', reason='foreground_cleanup_unconfirmed')
            if '_failurePhase' in r:
                r['_cleanupFailure']='foreground_cleanup_unconfirmed'
            else:
                r['_failurePhase']='foreground_monitor_cleanup'
                raise ValueError('foreground_cleanup_unconfirmed') from cleanup_errors[0]
